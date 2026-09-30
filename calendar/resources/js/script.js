// All events saved so far. An event's position in this array is used as its id:
// each card stores it in data-index so clicking the card can find its event.
const events = [];

const ALL_DAY = 'All day';

// Index into `events` of the event being edited, or null when creating a new one.
let editingIndex = null;

// Bootstrap 5.3 "subtle" background + matching "emphasis" text: a light tint with dark text,
// designed as a readable pair. The solid border-* class gives each category a stronger accent.
const CATEGORY_STYLES = {
  academic: 'bg-primary-subtle text-primary-emphasis border-primary',
  work:     'bg-success-subtle text-success-emphasis border-success',
  social:   'bg-warning-subtle text-warning-emphasis border-warning',
  personal: 'bg-danger-subtle text-danger-emphasis border-danger',
  other:    'bg-secondary-subtle text-secondary-emphasis border-secondary',
};

// Shows the Location field for in-person events and the Remote URL field for remote ones.
// The modality dropdown calls this from onchange="updateLocationOptions(this.value)";
// on page load and after a form reset it is called with no argument and reads the dropdown.
function updateLocationOptions(modality) {
  if (modality === undefined) {
    modality = document.getElementById('event_modality').value;
  }
  const isRemote = modality === 'remote';
  const location = document.getElementById('event_location');
  const remoteUrl = document.getElementById('event_remote_url');

  document.getElementById('location_group').classList.toggle('d-none', isRemote);
  document.getElementById('remote_url_group').classList.toggle('d-none', !isRemote);

  // Only the visible field is required; a hidden required field would block submission.
  location.required = !isRemote;
  remoteUrl.required = isRemote;

  // Clear the hidden field so a stale value can't fail validation unseen.
  if (isRemote) {
    location.value = '';
  } else {
    remoteUrl.value = '';
  }
}

updateLocationOptions();

function updateAllDayFields() {
  const allDay = document.getElementById('event_all_day').checked;
  const time = document.getElementById('event_time');

  // A disabled input is skipped by validation, but keep required in sync for clarity.
  time.disabled = allDay;
  time.required = !allDay;
  if (allDay) time.value = '';
}

document.getElementById('event_all_day').addEventListener('change', updateAllDayFields);
updateAllDayFields();

// "14:30" -> "2:30 PM"
function formatTime(time24) {
  const [hours, minutes] = time24.split(':').map(Number);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

// Minutes since midnight; all-day events get -1 so they sort above timed events.
function getSortKey(eventDetails) {
  if (eventDetails.time === ALL_DAY) return -1;
  const [hours, minutes] = eventDetails.time.split(':').map(Number);
  return hours * 60 + minutes;
}

// Builds and returns the DOM element for one event. It does not add it to the page.
// Text is set with textContent (never innerHTML) so user input can't inject markup.
function createEventCard(eventDetails) {
  const card = document.createElement('div');
  const style = CATEGORY_STYLES[eventDetails.category] || CATEGORY_STYLES.other;
  card.className = `event card border-start border-4 ${style} mt-2 p-2 small text-break`;
  card.dataset.sortKey = getSortKey(eventDetails);
  card.dataset.category = eventDetails.category;

  // Extra credit: remember which event this card shows so clicking it opens the editor.
  card.dataset.index = events.indexOf(eventDetails);
  card.title = 'Click to edit';
  card.addEventListener('click', () => editEvent(Number(card.dataset.index)));

  const name = document.createElement('div');
  name.className = 'fw-bold';
  name.textContent = eventDetails.name;
  card.appendChild(name);

  const time = document.createElement('div');
  time.className = 'fw-semibold';
  time.textContent = eventDetails.time === ALL_DAY ? ALL_DAY : formatTime(eventDetails.time);
  card.appendChild(time);

  const where = document.createElement('div');
  if (eventDetails.modality === 'remote') {
    const link = document.createElement('a');
    link.href = eventDetails.remote_url;
    link.className = 'text-reset';  // default link blue is low-contrast on the tinted backgrounds
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Join remotely';
    link.addEventListener('click', e => e.stopPropagation());  // follow the link, don't open the editor
    where.appendChild(link);
  } else {
    where.textContent = eventDetails.location;
  }
  card.appendChild(where);

  if (eventDetails.attendees.length > 0) {
    const attendees = document.createElement('div');
    attendees.textContent = `Attendees: ${eventDetails.attendees.join(', ')}`;
    card.appendChild(attendees);
  }

  const category = document.createElement('span');
  category.className = 'badge text-bg-dark align-self-start mt-1';
  category.textContent = eventDetails.category.charAt(0).toUpperCase() + eventDetails.category.slice(1);
  card.appendChild(category);

  return card;
}

// Creates the card and inserts it into its weekday column, keeping the column
// ordered by time (all-day first).
function addEventToCalendarUI(eventDetails) {
  const column = document.getElementById(eventDetails.weekday);
  if (!column) return;

  const card = createEventCard(eventDetails);
  const key = Number(card.dataset.sortKey);
  const nextCard = Array.from(column.querySelectorAll('.event'))
    .find(existing => Number(existing.dataset.sortKey) > key);

  column.insertBefore(card, nextCard || null);  // null appends to the end
}

// Puts the modal back into "Create Event" mode with empty fields.
function resetForm() {
  document.getElementById('event_form').reset();
  updateLocationOptions();  // reset() puts modality back to in-person
  updateAllDayFields();     // reset() unchecks All day, so re-enable the time input
  editingIndex = null;
  document.getElementById('eventModalLabel').textContent = 'Create Event';
}

// Closing the modal without saving (Close, X, Esc or the backdrop) discards any edit in progress.
document.getElementById('event_modal').addEventListener('hidden.bs.modal', resetForm);

function saveEvent() {
  const form = document.getElementById('event_form');

  // 2. Validate before saving; shows the browser's error bubble and stops if invalid.
  if (!form.reportValidity()) return;

  // 1. Read the form values.
  const allDay = document.getElementById('event_all_day').checked;
  const modality = document.getElementById('event_modality').value;
  const isRemote = modality === 'remote';
  const location = document.getElementById('event_location').value.trim();
  const remoteUrl = document.getElementById('event_remote_url').value.trim();

  // 3. Build the event object. 5. The location field that doesn't apply to the modality is null.
  const eventDetails = {
    name: document.getElementById('event_name').value.trim(),
    weekday: document.getElementById('event_weekday').value,
    time: allDay ? ALL_DAY : document.getElementById('event_time').value,
    modality: modality,
    location: isRemote ? null : location,
    remote_url: isRemote ? remoteUrl : null,
    attendees: document.getElementById('event_attendees').value
      .split(',')
      .map(a => a.trim())
      .filter(a => a !== ''),
    category: document.getElementById('event_category').value,
  };

  // 4. Store it: add a new event, or (extra credit) replace the one being edited.
  if (editingIndex === null) {
    events.push(eventDetails);
  } else {
    events[editingIndex] = eventDetails;
    removeEventCard(editingIndex);  // the old card comes off; a fresh one is drawn below
  }

  // 6. Log during development to verify the contents.
  console.log(events);

  // 7. Draw it on the calendar.
  addEventToCalendarUI(eventDetails);

  // 8. Reset the form.
  resetForm();

  // 9. Close the modal.
  bootstrap.Modal.getOrCreateInstance(document.getElementById('event_modal')).hide();
}

// ---- Extra credit: update an existing event by clicking its card ----

// Opens the modal pre-filled with an existing event so it can be edited. Saving then
// replaces that event and its card instead of creating a duplicate (see saveEvent).
function editEvent(index) {
  const eventDetails = events[index];
  if (!eventDetails) return;

  editingIndex = index;
  document.getElementById('eventModalLabel').textContent = 'Edit Event';

  document.getElementById('event_name').value = eventDetails.name;
  document.getElementById('event_weekday').value = eventDetails.weekday;

  const allDay = eventDetails.time === ALL_DAY;
  document.getElementById('event_all_day').checked = allDay;
  updateAllDayFields();
  if (!allDay) document.getElementById('event_time').value = eventDetails.time;

  document.getElementById('event_modality').value = eventDetails.modality;
  updateLocationOptions(eventDetails.modality);  // shows the right field for this modality
  document.getElementById('event_location').value = eventDetails.location || '';
  document.getElementById('event_remote_url').value = eventDetails.remote_url || '';

  document.getElementById('event_attendees').value = eventDetails.attendees.join(', ');
  document.getElementById('event_category').value = eventDetails.category;

  bootstrap.Modal.getOrCreateInstance(document.getElementById('event_modal')).show();
}

// Removes the card drawn for events[index], if there is one.
function removeEventCard(index) {
  const card = document.querySelector(`.event[data-index="${index}"]`);
  if (card) card.remove();
}
