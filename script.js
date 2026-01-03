const START_HOUR = 9;
const END_HOUR = 20; // 8 PM
const MIN_INTERVAL = 30; // 30 minutes visual block
const SNAP_MINUTES = 10; // Snap to nearest 10 mins
const PIXELS_PER_30_MIN = 40; // Must match CSS --grid-row-height
const PIXELS_PER_MIN = PIXELS_PER_30_MIN / 30;

// State
let events = JSON.parse(localStorage.getItem('timetable_events')) || [];
let editingEventId = null;

// Pastel colors
const COLORS = [
    '#ffcdd2', '#f8bbd0', '#e1bee7', '#d1c4e9', '#c5cae9',
    '#bbdefb', '#b3e5fc', '#b2ebf2', '#b2dfdb', '#c8e6c9',
    '#dcedc8', '#f0f4c3', '#fff9c4', '#ffecb3', '#ffe0b2', '#ffccbc'
];

// DOM Elements
const gridContainer = document.getElementById('gridContainer');
const timeSidebar = document.querySelector('.time-sidebar');
const modalOverlay = document.getElementById('modalOverlay');
const addBtn = document.getElementById('addBtn');
const cancelBtn = document.getElementById('cancelBtn');
const saveBtn = document.getElementById('saveBtn');
const daySelector = document.getElementById('daySelector');
const eventNameInput = document.getElementById('eventName');
const startTimeInput = document.getElementById('startTime');
const durationInput = document.getElementById('duration');

// Initialization
function init() {
    renderTimeLabels();
    renderGridBackground();
    renderEvents();
}

function getRandomColor() {
    return COLORS[Math.floor(Math.random() * COLORS.length)];
}

// Time Utils
function timeStringToMinutes(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

function minutesToTimeString(totalMinutes) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Rendering
function renderTimeLabels() {
    timeSidebar.innerHTML = '';
    // Go up to END_HOUR + 0 (if we want to show the closing text) or just labels
    for (let h = START_HOUR; h <= END_HOUR; h++) {
        // :00
        const label1 = document.createElement('div');
        label1.className = 'time-slot-label';
        label1.textContent = `${String(h).padStart(2, '0')}:00`;
        timeSidebar.appendChild(label1);

        // :30 (Don't add if it's the very last tick after END_HOUR)
        if (h < END_HOUR) {
            const label2 = document.createElement('div');
            label2.className = 'time-slot-label';
            label2.textContent = `${String(h).padStart(2, '0')}:30`;
            timeSidebar.appendChild(label2);
        }
    }
}

function renderGridBackground() {
    gridContainer.innerHTML = '';

    // Create 5 columns
    for (let i = 0; i < 5; i++) {
        const col = document.createElement('div');
        col.className = 'grid-col';
        col.dataset.day = i;
        gridContainer.appendChild(col);
    }

    // Set total height based on time range
    const totalMinutes = (END_HOUR - START_HOUR) * 60;
    const totalHeight = totalMinutes * PIXELS_PER_MIN;
    gridContainer.style.height = `${totalHeight}px`;
}

function renderEvents() {
    // Clear existing events but keep columns
    const columns = document.querySelectorAll('.grid-col');
    columns.forEach(col => {
        // Remove all children that are event cards
        const cards = col.querySelectorAll('.event-card');
        cards.forEach(c => c.remove());
    });

    events.forEach(event => {
        const col = columns[event.day];
        if (!col) return;

        const eventCard = createEventElement(event);
        col.appendChild(eventCard);
    });
}

function createEventElement(event) {
    const div = document.createElement('div');
    div.className = 'event-card';
    div.id = event.id;
    div.style.backgroundColor = event.color;

    // Calculate Position and Height
    const startMinutes = timeStringToMinutes(event.startTime);
    const dayStartMinutes = START_HOUR * 60;
    const offsetMinutes = startMinutes - dayStartMinutes;

    const topPx = offsetMinutes * PIXELS_PER_MIN;
    const heightPx = event.duration * PIXELS_PER_MIN;

    div.style.top = `${topPx}px`;
    console.log(heightPx);
    div.style.height = `${Math.max(20, heightPx)}px`; // Minimum height visibility

    div.innerHTML = `
        <div class="event-name">${event.name}</div>
        <div class="event-time">${event.startTime} (${event.duration}분)</div>
        <div class="resize-handle"></div>
    `;

    // Attach Drag & Resize handlers
    setupInteractions(div, event);

    return div;
}

// Interactions
function setupInteractions(card, eventData) {
    const handle = card.querySelector('.resize-handle');

    // Resize Logic
    handle.addEventListener('pointerdown', (e) => {
        e.stopPropagation(); // Prevent drag
        card.setPointerCapture(e.pointerId); // Capture pointer for consistent tracking

        let startY = e.clientY;
        let startHeight = parseInt(getComputedStyle(card).height);

        const onPointerMove = (moveEvent) => {
            const dy = moveEvent.clientY - startY;
            let newHeight = startHeight + dy;
            if (newHeight < 20) newHeight = 20;
            card.style.height = `${newHeight}px`;
        };

        const onPointerUp = (upEvent) => {
            card.removeEventListener('pointermove', onPointerMove);
            card.removeEventListener('pointerup', onPointerUp);
            card.releasePointerCapture(e.pointerId);

            let finalHeight = parseInt(card.style.height);
            let duration = Math.round(finalHeight / PIXELS_PER_MIN);
            duration = Math.round(duration / SNAP_MINUTES) * SNAP_MINUTES;

            updateEvent(eventData.id, { duration: duration });
        };

        card.addEventListener('pointermove', onPointerMove);
        card.addEventListener('pointerup', onPointerUp);
    });

    // Drag Logic
    card.addEventListener('pointerdown', (e) => {
        if (e.target.classList.contains('resize-handle')) return;

        // Long Press Logic Variables
        let longPressTimer;
        let isDrag = false;
        const LONG_PRESS_DURATION = 800; // ms

        // Start Timer
        longPressTimer = setTimeout(() => {
            if (!isDrag) {
                if (confirm('일정을 삭제하시겠습니까?')) {
                    deleteEvent(eventData.id);
                }
            }
        }, LONG_PRESS_DURATION);

        const startX = e.clientX;
        const startY = e.clientY;

        let shiftX = e.clientX - card.getBoundingClientRect().left;
        let shiftY = e.clientY - card.getBoundingClientRect().top;

        const dragProxy = card.cloneNode(true);
        dragProxy.classList.add('dragging');
        dragProxy.style.position = 'fixed';
        dragProxy.style.width = getComputedStyle(card).width;
        dragProxy.style.height = getComputedStyle(card).height;
        dragProxy.style.zIndex = 1000;
        dragProxy.style.pointerEvents = 'none';
        dragProxy.style.display = 'none'; // Hide initially until moved
        document.body.appendChild(dragProxy);

        const moveAt = (pageX, pageY) => {
            dragProxy.style.left = pageX - shiftX + 'px';
            dragProxy.style.top = pageY - shiftY + 'px';

            // Auto scroll on mobile if near edges? 
            // Browser might handle basics, but 'touch-action: none' prevents scroll.
            // We might need custom scroll logic for perfect UX, but let's stick to drag first.
        };

        const onPointerMove = (event) => {
            // Check threshold to detect actual drag vs jitter
            if (Math.abs(event.clientX - startX) > 5 || Math.abs(event.clientY - startY) > 5) {
                clearTimeout(longPressTimer); // Cancel delete
                isDrag = true;

                // Now start showing drag
                dragProxy.style.display = 'block';
                card.style.opacity = '0.3';
                moveAt(event.pageX, event.pageY);
            }
        };

        const onPointerUp = (event) => {
            clearTimeout(longPressTimer);
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);
            dragProxy.remove();
            card.style.opacity = '1';

            if (!isDrag) {
                return;
            }
            card.classList.remove('dragging');

            // Hit test
            const cols = document.querySelectorAll('.grid-col');
            let foundColIndex = -1;

            cols.forEach((col, index) => {
                const r = col.getBoundingClientRect();
                if (event.clientX >= r.left && event.clientX <= r.right &&
                    event.clientY >= r.top && event.clientY <= r.bottom) {
                    foundColIndex = index;
                }
            });

            if (foundColIndex === -1) {
                return;
            }

            // Identify Time
            const containerRect = gridContainer.getBoundingClientRect();
            const relY = event.clientY - containerRect.top - shiftY;

            let minutesFromStart = relY / PIXELS_PER_MIN;
            let absoluteMinutes = minutesFromStart + (START_HOUR * 60);
            absoluteMinutes = Math.round(absoluteMinutes / SNAP_MINUTES) * SNAP_MINUTES;

            if (absoluteMinutes < START_HOUR * 60) absoluteMinutes = START_HOUR * 60;

            const newStartTime = minutesToTimeString(absoluteMinutes);

            updateEvent(eventData.id, {
                day: foundColIndex,
                startTime: newStartTime
            });
        };

        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
    });

    // Double click to EDIT
    card.addEventListener('dblclick', () => {
        editingEventId = eventData.id;

        // Fill form
        eventNameInput.value = eventData.name;
        startTimeInput.value = eventData.startTime;
        durationInput.value = eventData.duration;

        // Set Day
        currentDayFilter = eventData.day;
        document.querySelectorAll('.day-btn').forEach(btn => {
            btn.classList.toggle('selected', parseInt(btn.dataset.day) === currentDayFilter);
        });

        modalOverlay.classList.add('active');
        saveBtn.textContent = '수정하기';
    });
}


// Data Management
function saveEvents() {
    localStorage.setItem('timetable_events', JSON.stringify(events));
    renderEvents();
}

function addEvent(data) {
    events.push({
        id: Date.now().toString(),
        ...data,
        color: getRandomColor()
    });
    saveEvents();
}

function updateEvent(id, updates) {
    const idx = events.findIndex(e => e.id === id);
    if (idx !== -1) {
        events[idx] = { ...events[idx], ...updates };
        saveEvents();
    }
}

function deleteEvent(id) {
    events = events.filter(e => e.id !== id);
    saveEvents();
}

// Modal Logic
let currentDayFilter = 0;

addBtn.addEventListener('click', () => {
    editingEventId = null; // New Mode
    modalOverlay.classList.add('active');

    // Cleanup Form
    eventNameInput.value = '';
    startTimeInput.value = ''; // Clear start time
    durationInput.value = ''; // Clear duration
    saveBtn.textContent = '추가하기';

    // Reset day selector visual to default (Day 0)
    currentDayFilter = 0;
    document.querySelectorAll('.day-btn').forEach(btn => {
        btn.classList.toggle('selected', parseInt(btn.dataset.day) === currentDayFilter);
    });

    // Default focus
    eventNameInput.focus();
});

cancelBtn.addEventListener('click', () => {
    modalOverlay.classList.remove('active');
});

modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) modalOverlay.classList.remove('active');
});

// Day Selector
daySelector.addEventListener('click', (e) => {
    if (e.target.classList.contains('day-btn')) {
        document.querySelectorAll('.day-btn').forEach(btn => btn.classList.remove('selected'));
        e.target.classList.add('selected');
        currentDayFilter = parseInt(e.target.dataset.day);
    }
});

saveBtn.addEventListener('click', () => {
    const name = eventNameInput.value.trim();
    if (!name) {
        alert('이름을 입력해주세요');
        return;
    }

    const startTime = startTimeInput.value;
    const duration = parseInt(durationInput.value);

    if (!startTime || isNaN(duration)) {
        alert('시간을 올바르게 입력해주세요');
        return;
    }

    if (editingEventId) {
        updateEvent(editingEventId, {
            name,
            day: currentDayFilter,
            startTime,
            duration
        });
    } else {
        addEvent({
            name,
            day: currentDayFilter,
            startTime,
            duration,
        });
    }

    modalOverlay.classList.remove('active');
});

// Run
init();
