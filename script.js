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
    handle.addEventListener('mousedown', (e) => {
        e.stopPropagation(); // Prevent drag
        let startY = e.clientY;
        let startHeight = parseInt(getComputedStyle(card).height);

        const onMouseMove = (moveEvent) => {
            const dy = moveEvent.clientY - startY;
            let newHeight = startHeight + dy;
            // Snap to 10 mins (approx 13.33px)
            // newHeight = Math.round(newHeight / snapPx) * snapPx; 
            // Just visual update effectively? User wants flexible but snap. behavior.

            if (newHeight < 20) newHeight = 20;
            card.style.height = `${newHeight}px`;
        };

        const onMouseUp = (upEvent) => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            // Finalize
            let finalHeight = parseInt(card.style.height);
            // Convert back to minutes
            let duration = Math.round(finalHeight / PIXELS_PER_MIN);
            // Snap duration to nearest SNAP_MINUTES
            duration = Math.round(duration / SNAP_MINUTES) * SNAP_MINUTES;

            updateEvent(eventData.id, { duration: duration });
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    // Drag Logic
    card.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('resize-handle')) return;

        card.classList.add('dragging');
        let shiftX = e.clientX - card.getBoundingClientRect().left;
        let shiftY = e.clientY - card.getBoundingClientRect().top;

        // Visual helper needs to move out of the column to body or container so it can float across columns
        // Actually, easiest is to use fixed/absolute on body, but keeping it in flow is hard.
        // Let's keep it simple: we compute nearest column on mouse up.
        // For visual feedback, we might want to just let it slide.

        // Strategy: When dragging, make position: fixed or absolute relative to window/container
        // Use a ghost element or move the logic to container level?
        // Let's try changing parent to gridContainer temporarily for smooth dragging

        const originCol = card.parentElement;
        const startLeft = card.getBoundingClientRect().left;
        const startTop = card.getBoundingClientRect().top;

        // Placeholder to keep layout? Not needed for absolute pos.

        const onMouseMove = (moveEvent) => {
            // In a real robust app we'd move it to body. 
            // We'll trust the user drags reasonably for this simple version.
            // Or better: Change Top/Left based on delta
            // Actually, we want to snap to columns.

            // To support moving between columns cleanly, we probably should re-parent to the gridContainer
            // But 'events' array drives rendering.

            // Simple visual update:
            // card.style.transform = `translate(${moveEvent.clientX - startX}px, ${moveEvent.clientY - startY}px)`;
            // This is complex to get right with column logic.
            // Let's implement "Click to Edit"? No user asked for drag.
            // "이리저리 옮겨가면서" -> implies drag.
        };

        // Simplified Drag: 
        // We will calculate the new day/time based on where the mouse is RELEASED.
        // While dragging, we just follow mouse.

        const initialParent = card.parentElement;
        const rect = initialParent.getBoundingClientRect(); // Column rect
        const containerRect = gridContainer.getBoundingClientRect();

        // Clone card for dragging visual
        const dragProxy = card.cloneNode(true);
        dragProxy.classList.add('dragging');
        dragProxy.style.position = 'fixed';
        dragProxy.style.width = getComputedStyle(card).width;
        dragProxy.style.height = getComputedStyle(card).height;
        dragProxy.style.zIndex = 1000;
        dragProxy.style.pointerEvents = 'none'; // Allow clicks to pass through for dblclick
        document.body.appendChild(dragProxy);

        // Hide original
        card.style.opacity = '0.3';

        const moveAt = (pageX, pageY) => {
            dragProxy.style.left = pageX - shiftX + 'px';
            dragProxy.style.top = pageY - shiftY + 'px';
        };

        moveAt(e.pageX, e.pageY);

        const onMove = (event) => {
            moveAt(event.pageX, event.pageY);
        };

        const onUp = (event) => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            dragProxy.remove();
            card.style.opacity = '1';
            card.classList.remove('dragging');

            // Hit test
            // 1. Identify Column
            const cols = document.querySelectorAll('.grid-col');
            let foundColIndex = -1;

            cols.forEach((col, index) => {
                const r = col.getBoundingClientRect();
                if (event.clientX >= r.left && event.clientX <= r.right) {
                    foundColIndex = index;
                }
            });

            // Dragged OUTSIDE grid -> Delete
            if (foundColIndex === -1) {
                if (confirm('일정을 삭제하시겠습니까?')) {
                    deleteEvent(eventData.id);
                }
                return;
            }

            // 2. Identify Time
            // Relative Y in the container
            const containerRect = gridContainer.getBoundingClientRect();
            const relY = event.clientY - containerRect.top - shiftY; // Adjust for grab offset
            // Limit to valid range
            // relY = Math.max(0, relY);

            // Convert pixels to minutes
            let minutesFromStart = relY / PIXELS_PER_MIN;
            // Add START_HOUR offset
            let absoluteMinutes = minutesFromStart + (START_HOUR * 60);

            // Snap
            absoluteMinutes = Math.round(absoluteMinutes / SNAP_MINUTES) * SNAP_MINUTES;

            // Boundaries
            const maxMinutes = (END_HOUR * 60) - eventData.duration;
            if (absoluteMinutes < START_HOUR * 60) absoluteMinutes = START_HOUR * 60;
            // if (absoluteMinutes > maxMinutes) absoluteMinutes = maxMinutes; // Optional: restrict

            const newStartTime = minutesToTimeString(absoluteMinutes);

            updateEvent(eventData.id, {
                day: foundColIndex,
                startTime: newStartTime
            });
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
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
