class TaskTimer {
    constructor() {
        this.tasks = [];
        this.currentRunningTask = null;
        this.isRestMode = false;
        this.restTime = 5 * 60; // 5 minutes in seconds
        this.interval = null;
        
        // Task states
        this.TASK_STATES = {
            BACKLOG: 'backlog',
            TODAY: 'today',
            COMPLETED: 'completed'
        };
        
        this.initializeElements();
        this.bindEvents();
        this.updateDisplay();
    }
    
    initializeElements() {
        this.startRestBtn = document.getElementById('start-rest-btn');
        this.taskInput = document.getElementById('task-input');
        this.addTaskBtn = document.getElementById('add-task-btn');
        this.restTimeInput = document.getElementById('rest-time');
        this.restTimeButtons = document.querySelectorAll('.time-btn[data-action*="rest"]');
        
        // Kanban board elements
        this.backlogTasks = document.getElementById('backlog-tasks');
        this.todayTasks = document.getElementById('today-tasks');
        this.completedTasks = document.getElementById('completed-tasks');
        this.backlogCount = document.getElementById('backlog-count');
        this.todayCount = document.getElementById('today-count');
        this.completedCount = document.getElementById('completed-count');
        
        // Doodle canvas elements
        this.doodleModal = document.getElementById('doodle-modal');
        this.doodleCanvas = document.getElementById('doodle-canvas');
        this.doodleTimerDisplay = document.getElementById('doodle-timer-display');
        this.clearCanvasBtn = document.getElementById('clear-canvas');
        this.closeDoodleBtn = document.getElementById('close-doodle');
        
        // Canvas drawing variables
        this.isDrawing = false;
        this.lastX = 0;
        this.lastY = 0;
    }
    
    bindEvents() {
        this.startRestBtn.addEventListener('click', () => this.handleRestButtonClick());
        this.addTaskBtn.addEventListener('click', () => this.addTask());
        this.taskInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addTask();
        });
        
        if (this.restTimeInput) {
            this.restTimeInput.addEventListener('change', (e) => {
                this.restTime = parseInt(e.target.value) * 60;
            });
        }
        
        this.restTimeButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                this.adjustRestTime(action);
            });
        });
        
        // Close menus when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.task-menu-container')) {
                document.querySelectorAll('.task-menu').forEach(menu => {
                    menu.classList.remove('show');
                });
            }
            // Don't close edit mode when clicking outside - only close on X or checkmark
        });
        
        // Doodle canvas events
        this.clearCanvasBtn.addEventListener('click', () => this.clearCanvas());
        this.closeDoodleBtn.addEventListener('click', () => this.closeDoodle());
        
        // Close modal when clicking outside the canvas
        this.doodleModal.addEventListener('click', (e) => {
            if (e.target === this.doodleModal) {
                this.closeDoodle();
            }
        });
        
        // Canvas drawing events
        this.doodleCanvas.addEventListener('mousedown', (e) => {
            console.log('Canvas mousedown event');
            this.startDrawing(e);
        });
        this.doodleCanvas.addEventListener('mousemove', (e) => {
            console.log('Canvas mousemove event');
            this.draw(e);
        });
        this.doodleCanvas.addEventListener('mouseup', () => {
            console.log('Canvas mouseup event');
            this.stopDrawing();
        });
        this.doodleCanvas.addEventListener('mouseout', () => {
            console.log('Canvas mouseout event');
            this.stopDrawing();
        });
        
        // Touch events for mobile
        this.doodleCanvas.addEventListener('touchstart', (e) => {
            console.log('Canvas touchstart event');
            e.preventDefault();
            this.startDrawing(e);
        });
        this.doodleCanvas.addEventListener('touchmove', (e) => {
            console.log('Canvas touchmove event');
            e.preventDefault();
            this.draw(e);
        });
        this.doodleCanvas.addEventListener('touchend', (e) => {
            console.log('Canvas touchend event');
            e.preventDefault();
            this.stopDrawing();
        });
        
        // Drag and drop events
        this.setupDragAndDrop();
    }
    
    addTask() {
        const taskName = this.taskInput.value.trim();
        if (!taskName) return;
        
        const task = {
            id: Date.now(),
            name: taskName,
            timeSpent: 0,
            isRunning: false,
            isCompleted: false,
            startTime: null,
            endTime: null,
            state: this.TASK_STATES.BACKLOG,
            sessions: [] // Array to store multiple timer sessions
        };
        
        this.tasks.push(task);
        this.taskInput.value = '';
        this.renderTasks();
    }
    
    renderTasks() {
        // Clear all columns
        this.backlogTasks.innerHTML = '';
        this.todayTasks.innerHTML = '';
        this.completedTasks.innerHTML = '';
        
        // Group tasks by state
        const backlogTasks = this.tasks.filter(task => task.state === this.TASK_STATES.BACKLOG);
        const todayTasks = this.tasks.filter(task => task.state === this.TASK_STATES.TODAY);
        const completedTasks = this.tasks.filter(task => task.state === this.TASK_STATES.COMPLETED);
        
        // Update counts
        this.backlogCount.textContent = backlogTasks.length;
        this.todayCount.textContent = todayTasks.length;
        this.completedCount.textContent = completedTasks.length;
        
        // Render each column
        this.renderTaskColumn(backlogTasks, this.backlogTasks, this.TASK_STATES.BACKLOG);
        this.renderTaskColumn(todayTasks, this.todayTasks, this.TASK_STATES.TODAY);
        this.renderTaskColumn(completedTasks, this.completedTasks, this.TASK_STATES.COMPLETED);
    }
    
    renderTaskColumn(tasks, container, columnState) {
        tasks.forEach(task => {
            const taskElement = document.createElement('div');
            taskElement.className = `task-item ${task.isRunning ? 'running' : ''} ${task.isEditing ? 'editing' : ''}`;
            taskElement.draggable = true;
            taskElement.dataset.taskId = task.id;
            taskElement.dataset.currentState = task.state;
            
            // Show countdown for running task, user-friendly time for completed tasks
            let timeDisplay;
            if (task.isRunning) {
                timeDisplay = this.formatTime(task.timeSpent);
            } else if (task.isCompleted) {
                timeDisplay = this.formatUserFriendlyTime(task.timeSpent);
            } else {
                timeDisplay = this.formatTime(task.timeSpent);
            }
            
            const timeRange = task.startTime && task.endTime 
                ? `${this.formatTimeForDisplay(task.startTime)} - ${this.formatTimeForDisplay(task.endTime)}`
                : task.startTime 
                    ? `${this.formatTimeForDisplay(task.startTime)} - --:--`
                    : '--:-- - --:--';
            
            if (task.isEditing) {
                // Special edit mode for backlog cards - only title
                if (columnState === this.TASK_STATES.BACKLOG) {
                    taskElement.innerHTML = `
                        <div class="task-header backlog-header">
                            <input type="text" class="backlog-edit-name" value="${task.name}" 
                                   onkeypress="if(event.key==='Enter') taskTimer.saveTask(${task.id})"
                                   onblur="taskTimer.saveTask(${task.id})">
                            <div class="backlog-controls">
                                <button class="task-btn save" onclick="taskTimer.saveTask(${task.id})" title="Save">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M20 6L9 17l-5-5"/>
                                    </svg>
                                </button>
                                <button class="task-btn cancel" onclick="taskTimer.cancelEditTask(${task.id})" title="Cancel">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M18 6L6 18M6 6l12 12"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    `;
                } else if (columnState === this.TASK_STATES.TODAY) {
                    // Simple edit mode for today cards - just title
                    taskElement.innerHTML = `
                        <div class="task-header">
                            <div class="task-checkbox ${task.isCompleted ? 'checked' : ''}" 
                                 onclick="taskTimer.toggleTaskCompletion(${task.id})"></div>
                            <input type="text" class="backlog-edit-name" value="${task.name}" 
                                   onkeypress="if(event.key==='Enter') taskTimer.saveTask(${task.id})"
                                   onblur="taskTimer.saveTask(${task.id})">
                            <div class="today-controls">
                                <button class="task-btn save" onclick="taskTimer.saveTask(${task.id})" title="Save">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M20 6L9 17l-5-5"/>
                                    </svg>
                                </button>
                                <button class="task-btn cancel" onclick="taskTimer.cancelEditTask(${task.id})" title="Cancel">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M18 6L6 18M6 6l12 12"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    `;
                } else {
                    // Full edit mode layout for other columns
                    taskElement.innerHTML = `
                        <div class="task-header">
                            <div class="task-checkbox ${task.isCompleted ? 'checked' : ''}" 
                                 onclick="taskTimer.toggleTaskCompletion(${task.id})"></div>
                            <input type="text" class="task-edit-name" value="${task.name}" 
                                   onkeypress="if(event.key==='Enter') taskTimer.saveTask(${task.id})">
                        </div>
                        <div class="task-edit-time-range">
                            <input type="text" class="task-edit-start-time" 
                                   value="${task.startTime ? this.formatTimeForDisplay(task.startTime) : ''}" 
                                   placeholder="11:55 PM"
                                   maxlength="8"
                                   oninput="taskTimer.formatTimeInput(this); taskTimer.validateTimeRange(this)"
                                   onkeypress="if(event.key==='Enter') taskTimer.saveTask(${task.id})"
                                   onblur="taskTimer.validateTimeInput(this); taskTimer.validateTimeRange(this)">
                            <span> - </span>
                            <input type="text" class="task-edit-end-time" 
                                   value="${task.endTime ? this.formatTimeForDisplay(task.endTime) : ''}" 
                                   placeholder="12:30 PM"
                                   maxlength="8"
                                   oninput="taskTimer.formatTimeInput(this); taskTimer.validateTimeRange(this)"
                                   onkeypress="if(event.key==='Enter') taskTimer.saveTask(${task.id})"
                                   onblur="taskTimer.validateTimeInput(this); taskTimer.validateTimeRange(this)">
                        </div>
                        <div class="task-edit-duration">
                            <input type="number" class="task-edit-hours" value="${Math.floor(task.timeSpent / 3600)}" 
                                   min="0" max="23" placeholder="0"
                                   onkeypress="if(event.key==='Enter') taskTimer.saveTask(${task.id})">
                            <span>h</span>
                            <input type="number" class="task-edit-minutes" value="${Math.floor((task.timeSpent % 3600) / 60)}" 
                                   min="0" max="59" placeholder="0"
                                   onkeypress="if(event.key==='Enter') taskTimer.saveTask(${task.id})">
                            <span>m</span>
                            <input type="number" class="task-edit-seconds" value="${task.timeSpent % 60}" 
                                   min="0" max="59" placeholder="0"
                                   onkeypress="if(event.key==='Enter') taskTimer.saveTask(${task.id})">
                            <span>s</span>
                        </div>
                        <div class="task-footer">
                            <div class="task-edit-controls">
                                <button class="task-btn save" onclick="taskTimer.saveTask(${task.id})">
                                    ✓
                                </button>
                                <button class="task-btn cancel" onclick="taskTimer.cancelEditTask(${task.id})">
                                    ✕
                                </button>
                            </div>
                        </div>
                    `;
                }
            } else {
                // Normal mode layout
                if (columnState === this.TASK_STATES.BACKLOG) {
                    let controls = this.getTaskControls(task, columnState);
                    
                    // Normal mode for backlog cards
                    taskElement.innerHTML = `
                        <div class="task-header backlog-header">
                            <div class="task-name backlog-title ${task.isCompleted ? 'completed' : ''}" 
                                 onclick="taskTimer.startEditTask(${task.id})" title="Click to edit">${task.name}</div>
                            <div class="backlog-controls">
                                ${controls}
                            </div>
                        </div>
                    `;
                } else if (columnState === this.TASK_STATES.TODAY) {
                    let controls = this.getTaskControls(task, columnState);
                    
                    // Normal mode for today cards - checkbox + title + controls
                    let timeInfoHtml = '';
                    
                    // Show time info if task has sessions or is running
                    if (task.sessions.length > 0 || task.isRunning || task.timeSpent > 0) {
                        let timeRowsHtml = '';
                        
                        // Show completed sessions
                        task.sessions.forEach(session => {
                            const timeRange = `${this.formatTimeForDisplay(session.startTime)} - ${this.formatTimeForDisplay(session.endTime)}`;
                            timeRowsHtml += `
                                <div class="task-time-row">
                                    <div class="task-time-range">${timeRange}</div>
                                    <div class="task-total-duration">
                                        ${this.formatCompactTime(session.duration)}
                                    </div>
                                </div>
                            `;
                        });
                        
                        // Show current session if running
                        if (task.isRunning && task.currentSessionStartTime) {
                            timeRowsHtml += `
                                <div class="task-time-row">
                                    <div class="task-time-range">${this.formatTimeForDisplay(task.currentSessionStartTime)} - --:--</div>
                                    <div class="task-live-duration">
                                        ${this.formatCompactTime(task.timeSpent)}
                                    </div>
                                </div>
                            `;
                        }
                        
                        // Add total time row if there are multiple sessions or completed sessions
                        if (task.sessions.length > 0) {
                            const totalTime = task.sessions.reduce((total, session) => total + session.duration, 0);
                            timeRowsHtml += `
                                <div class="task-time-row task-total-row">
                                    <div class="task-time-range">Total</div>
                                    <div class="task-total-duration">
                                        ${this.formatCompactTime(totalTime)}
                                    </div>
                                </div>
                            `;
                        }
                        
                        timeInfoHtml = timeRowsHtml;
                    }
                    
                    taskElement.innerHTML = `
                        <div class="task-header">
                            <div class="task-checkbox ${task.isCompleted ? 'checked' : ''}" 
                                 onclick="taskTimer.toggleTaskCompletion(${task.id})"></div>
                            <div class="task-name ${task.isCompleted ? 'completed' : ''}" 
                                 onclick="taskTimer.startEditTask(${task.id})" title="Click to edit">${task.name}</div>
                            <div class="today-controls">
                                ${controls}
                            </div>
                        </div>
                        ${timeInfoHtml}
                    `;
                } else {
                    // Normal mode layout for other columns (completed)
                    let controls = this.getTaskControls(task, columnState);
                    
                    taskElement.innerHTML = `
                        <div class="task-header">
                            <div class="task-checkbox ${task.isCompleted ? 'checked' : ''}" 
                                 onclick="taskTimer.toggleTaskCompletion(${task.id})"></div>
                            <div class="task-name ${task.isCompleted ? 'completed' : ''}">${task.name}</div>
                        </div>
                        <div class="task-main">
                            <div class="task-time-range">${timeRange}</div>
                            <div class="task-time ${task.isRunning ? 'countdown' : ''} ${task.isCompleted ? 'completed-time' : ''}">${timeDisplay}</div>
                        </div>
                        <div class="task-footer">
                            <div class="task-controls ${task.isCompleted ? 'completed-controls' : ''}">
                                ${controls}
                            </div>
                        </div>
                    `;
                }
            }
            container.appendChild(taskElement);
        });
    }
    
    getTaskControls(task, columnState) {
        let controls = '';
        
        // Special controls for backlog cards - only arrow and delete
        if (columnState === this.TASK_STATES.BACKLOG) {
            controls += `<button class="arrow-btn backlog-arrow" onclick="taskTimer.moveTask(${task.id}, '${this.TASK_STATES.TODAY}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M5 12h14M12 5l7 7-7 7"/>
                            </svg>
                        </button>`;
            controls += `<button class="task-btn delete-btn" onclick="taskTimer.deleteTask(${task.id})" title="Delete task">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6"/>
                            </svg>
                        </button>`;
        } else if (columnState === this.TASK_STATES.TODAY) {
            // Special controls for today cards - play/pause and delete (no arrow)
            if (!task.isCompleted) {
                controls += `<button class="task-btn ${task.isRunning ? 'pause' : 'play'}" 
                                onclick="taskTimer.toggleTask(${task.id})">
                                ${task.isRunning ? '⏸' : '▶'}
                            </button>`;
            }
            controls += `<button class="task-btn delete-btn" onclick="taskTimer.deleteTask(${task.id})" title="Delete task">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6"/>
                            </svg>
                        </button>`;
        } else {
            // Add arrow buttons based on column for other columns (completed)
            controls += `<button class="arrow-btn right" onclick="taskTimer.moveTask(${task.id}, '${this.TASK_STATES.TODAY}')">←</button>`;
            
            // Add menu button for other columns
            controls += `<div class="task-menu-container" style="position: relative;">
                            <button class="task-btn menu" onclick="taskTimer.toggleMenu(${task.id})">
                                ⋯
                            </button>
                            <div class="task-menu" id="menu-${task.id}">
                                <div class="task-menu-item edit" onclick="taskTimer.startEditTask(${task.id})">
                                    Edit
                                </div>
                                <div class="task-menu-item delete" onclick="taskTimer.deleteTask(${task.id})">
                                    Delete
                                </div>
                            </div>
                        </div>`;
        }
        
        return controls;
    }
    
    toggleTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;
        
        // Only allow starting tasks from Today column
        if (task.state !== this.TASK_STATES.TODAY) {
            return;
        }
        
        // If task is completed, uncomplete it and start it
        if (task.isCompleted) {
            task.isCompleted = false;
            // Stop any currently running task
            if (this.currentRunningTask && this.currentRunningTask !== taskId) {
                this.pauseTask(this.currentRunningTask);
            }
            this.startTask(taskId);
            return;
        }
        
        // Stop any currently running task
        if (this.currentRunningTask && this.currentRunningTask !== taskId) {
            this.pauseTask(this.currentRunningTask);
        }
        
        if (task.isRunning) {
            this.pauseTask(taskId);
        } else {
            this.startTask(taskId);
        }
    }
    
    moveTask(taskId, newState) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;
        
        task.state = newState;
        
        // If moving to today, ensure it's not completed
        if (newState === this.TASK_STATES.TODAY) {
            task.isCompleted = false;
        }
        
        this.renderTasks();
    }
    
    toggleTaskCompletion(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;
        
        // If task is running, pause it first
        if (task.isRunning) {
            this.pauseTask(taskId);
        }
        
        task.isCompleted = !task.isCompleted;
        
        // If completing the task, move it to completed column and set end time
        if (task.isCompleted) {
            task.state = this.TASK_STATES.COMPLETED;
            if (task.startTime && !task.endTime) {
                task.endTime = new Date();
            }
        }
        
        this.renderTasks();
    }
    
    toggleMenu(taskId) {
        // Close all other menus
        document.querySelectorAll('.task-menu').forEach(menu => {
            menu.classList.remove('show');
        });
        
        // Toggle current menu
        const menu = document.getElementById(`menu-${taskId}`);
        if (menu) {
            menu.classList.toggle('show');
        }
    }
    
    startTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;
        
        task.isRunning = true;
        task.currentSessionStartTime = new Date(); // Track when current session started
        task.startTime = new Date(); // Keep for backward compatibility
        task.endTime = null; // Clear end time when restarting
        this.currentRunningTask = taskId;
        this.isRestMode = false;
        
        this.startTimer();
        this.renderTasks();
    }
    
    pauseTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;
        
        task.isRunning = false;
        task.endTime = new Date();
        
        // Save the current session
        if (task.currentSessionStartTime && task.timeSpent > 0) {
            const totalSessionTime = task.sessions.reduce((total, session) => total + session.duration, 0);
            const sessionDuration = task.timeSpent - totalSessionTime;
            if (sessionDuration > 0) {
                task.sessions.push({
                    startTime: task.currentSessionStartTime,
                    endTime: task.endTime,
                    duration: sessionDuration
                });
            }
        }
        
        if (this.currentRunningTask === taskId) {
            this.currentRunningTask = null;
        }
        
        this.stopTimer();
        this.renderTasks();
    }
    
    deleteTask(taskId) {
        this.tasks = this.tasks.filter(t => t.id !== taskId);
        if (this.currentRunningTask === taskId) {
            this.currentRunningTask = null;
            this.stopTimer();
        }
        this.renderTasks();
    }
    
    startEditTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;
        
        // Close menu
        this.toggleMenu(taskId);
        
        // Set editing mode
        task.isEditing = true;
        this.renderTasks();
        
        // Focus on name input after render
        setTimeout(() => {
            let nameInput;
            if (task.state === this.TASK_STATES.BACKLOG || task.state === this.TASK_STATES.TODAY) {
                nameInput = document.querySelector(`.task-item.editing .backlog-edit-name`);
            } else {
                nameInput = document.querySelector(`.task-item.editing .task-edit-name`);
            }
            if (nameInput) {
                nameInput.focus();
                nameInput.select();
            }
        }, 10);
    }
    
    saveTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;
        
        // Get values from inputs
        let nameInput;
        if (task.state === this.TASK_STATES.BACKLOG || task.state === this.TASK_STATES.TODAY) {
            nameInput = document.querySelector(`.task-item.editing .backlog-edit-name`);
        } else {
            nameInput = document.querySelector(`.task-item.editing .task-edit-name`);
        }
        
        const hoursInput = document.querySelector(`.task-item.editing .task-edit-hours`);
        const minutesInput = document.querySelector(`.task-item.editing .task-edit-minutes`);
        const secondsInput = document.querySelector(`.task-item.editing .task-edit-seconds`);
        const startTimeInput = document.querySelector(`.task-item.editing .task-edit-start-time`);
        const endTimeInput = document.querySelector(`.task-item.editing .task-edit-end-time`);
        
        if (nameInput) {
            const newName = nameInput.value.trim();
            if (newName && newName !== '') {
                task.name = newName;
            }
        }
        
        // Handle duration inputs (only for non-backlog tasks)
        if (task.state !== this.TASK_STATES.BACKLOG && hoursInput && minutesInput && secondsInput) {
            const hours = parseInt(hoursInput.value) || 0;
            const minutes = parseInt(minutesInput.value) || 0;
            const seconds = parseInt(secondsInput.value) || 0;
            
            // Validate ranges
            if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 && seconds >= 0 && seconds <= 59) {
                task.timeSpent = hours * 3600 + minutes * 60 + seconds;
            }
        }
        
        // Handle time range inputs (only for non-backlog tasks)
        if (task.state !== this.TASK_STATES.BACKLOG && startTimeInput && endTimeInput) {
            const startTimeStr = startTimeInput.value.trim();
            const endTimeStr = endTimeInput.value.trim();
            
            let startTime = null;
            let endTime = null;
            
            // Parse start time
            if (startTimeStr) {
                startTime = this.parseTimeString(startTimeStr);
                if (!startTime) {
                    // Invalid start time - don't save
                    this.showNotification('Invalid start time format. Use format like "11:55 PM"');
                    return;
                }
            }
            
            // Parse end time
            if (endTimeStr) {
                endTime = this.parseTimeString(endTimeStr);
                if (!endTime) {
                    // Invalid end time - don't save
                    this.showNotification('Invalid end time format. Use format like "12:30 PM"');
                    return;
                }
            }
            
            // Validate time logic if both times are provided
            if (startTime && endTime) {
                if (startTime > endTime) {
                    this.showNotification('Start time must be before or equal to end time. Please check your times.');
                    return;
                }
            }
            
            // Set the times if validation passed
            task.startTime = startTime;
            task.endTime = endTime;
        }
        
        // Exit editing mode
        task.isEditing = false;
        this.renderTasks();
    }
    
    cancelEditTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;
        
        // Exit editing mode without saving
        task.isEditing = false;
        this.renderTasks();
    }
    
    handleRestButtonClick() {
        if (this.isRestMode) {
            this.stopRest();
        } else {
            this.startRest();
        }
    }
    
    startRest() {
        console.log('Starting rest...');
        // Stop any running task
        if (this.currentRunningTask) {
            this.pauseTask(this.currentRunningTask);
        }
        
        this.isRestMode = true;
        this.startTimer();
        this.startRestBtn.textContent = 'Stop Rest';
        
        // Show doodle canvas
        this.showDoodle();
    }
    
    stopRest() {
        console.log('Stopping rest...');
        this.stopTimer();
        this.isRestMode = false;
        this.restTime = this.restTimeInput ? parseInt(this.restTimeInput.value) * 60 : 5 * 60;
        this.startRestBtn.textContent = 'Start Rest';
        this.updateDisplay();
        this.hideDoodle();
    }
    
    startTimer() {
        // Clear any existing timer first
        this.stopTimer();
        
        this.interval = setInterval(() => {
            if (this.isRestMode) {
                this.restTime--;
                this.updateDisplay();
                if (this.restTime <= 0) {
                    this.completeRest();
                }
            } else if (this.currentRunningTask) {
                const task = this.tasks.find(t => t.id === this.currentRunningTask);
                if (task) {
                    task.timeSpent++;
                    this.updateDisplay();
                }
            }
        }, 1000);
    }
    
    stopTimer() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }
    
    completeRest() {
        this.stopTimer();
        this.isRestMode = false;
        this.restTime = this.restTimeInput ? parseInt(this.restTimeInput.value) * 60 : 5 * 60;
        this.startRestBtn.textContent = 'Start Rest';
        this.updateDisplay();
        this.hideDoodle();
        this.showNotification('Rest time complete!');
    }
    
    adjustRestTime(action) {
        const currentValue = this.restTimeInput ? parseInt(this.restTimeInput.value) : 5;
        let newValue = currentValue;
        
        if (action === 'increase-rest') {
            newValue = Math.min(currentValue + 1, 60);
        } else if (action === 'decrease-rest') {
            newValue = Math.max(currentValue - 1, 1);
        }
        
        if (this.restTimeInput) {
            this.restTimeInput.value = newValue;
        }
        this.restTime = newValue * 60;
    }
    
    updateDisplay() {
        if (this.isRestMode) {
            // Update doodle timer if modal is open
            if (this.doodleModal.classList.contains('show')) {
                this.doodleTimerDisplay.textContent = this.formatTime(this.restTime);
            }
        }
        
        // Update task times in the task list
        this.renderTasks();
    }
    
    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;
        return `${hours}h ${minutes}m ${remainingSeconds}s`;
    }
    
    formatUserFriendlyTime(seconds) {
        if (seconds < 60) {
            return `${seconds}s`;
        } else if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            if (remainingSeconds === 0) {
                return `${minutes}m`;
            } else {
                return `${minutes}m ${remainingSeconds}s`;
            }
        } else {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            if (minutes === 0) {
                return `${hours}h`;
            } else {
                return `${hours}h ${minutes}m`;
            }
        }
    }
    
    formatCompactTime(seconds) {
        if (seconds < 60) {
            return `${seconds}s`;
        } else if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            if (remainingSeconds === 0) {
                return `${minutes}m`;
            } else {
                return `${minutes}m ${remainingSeconds}s`;
            }
        } else {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            if (minutes === 0) {
                return `${hours}h`;
            } else {
                return `${hours}h ${minutes}m`;
            }
        }
    }
    
    formatTimeForDisplay(date) {
        if (!date) return '--:--';
        return date.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true 
        });
    }
    
    parseTimeString(timeStr) {
        if (!timeStr || timeStr === '--:--') return null;
        
        // Handle formats like "11:55 PM", "11:55", "23:55"
        const timeRegex = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i;
        const match = timeStr.match(timeRegex);
        
        if (!match) return null;
        
        let hours = parseInt(match[1]);
        const minutes = parseInt(match[2]);
        const ampm = match[3] ? match[3].toUpperCase() : null;
        
        // Convert to 24-hour format
        if (ampm === 'PM' && hours !== 12) {
            hours += 12;
        } else if (ampm === 'AM' && hours === 12) {
            hours = 0;
        }
        
        // Validate hours and minutes
        if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            return null;
        }
        
        // Create date for today with the specified time
        const today = new Date();
        today.setHours(hours, minutes, 0, 0);
        return today;
    }
    
    formatTimeInput(input) {
        let value = input.value;
        
        // Remove any non-digit characters except AM/PM
        value = value.replace(/[^\d\sAPMapm]/g, '');
        
        // Auto-format as user types
        if (value.length >= 2 && !value.includes(':')) {
            // Insert colon after 2 digits
            value = value.substring(0, 2) + ':' + value.substring(2);
        }
        
        // Auto-add AM/PM if not present and we have enough digits
        if (value.length >= 5 && !value.match(/[APMapm]/)) {
            const timePart = value.substring(0, 5);
            if (timePart.match(/^\d{1,2}:\d{2}$/)) {
                const hours = parseInt(timePart.split(':')[0]);
                if (hours >= 0 && hours <= 23) {
                    // Add AM/PM based on hour
                    if (hours === 0) {
                        value = '12' + timePart.substring(2) + ' AM';
                    } else if (hours < 12) {
                        value = timePart + ' AM';
                    } else if (hours === 12) {
                        value = timePart + ' PM';
                    } else {
                        const displayHour = hours - 12;
                        value = displayHour + timePart.substring(2) + ' PM';
                    }
                }
            }
        }
        
        input.value = value;
    }
    
    validateTimeInput(input) {
        const value = input.value.trim();
        
        if (!value) {
            input.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            input.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
            return;
        }
        
        // Test if the time can be parsed
        const parsedTime = this.parseTimeString(value);
        
        if (parsedTime) {
            // Valid time - green border
            input.style.borderColor = '#22c55e';
            input.style.backgroundColor = 'rgba(34, 197, 94, 0.1)';
        } else {
            // Invalid time - red border
            input.style.borderColor = '#ef4444';
            input.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
        }
    }
    
    validateTimeRange(input) {
        // Find the other time input in the same task
        const taskItem = input.closest('.task-item');
        const startTimeInput = taskItem.querySelector('.task-edit-start-time');
        const endTimeInput = taskItem.querySelector('.task-edit-end-time');
        
        if (!startTimeInput || !endTimeInput) return;
        
        const startTimeStr = startTimeInput.value.trim();
        const endTimeStr = endTimeInput.value.trim();
        
        // Only validate if both times are provided and valid
        if (startTimeStr && endTimeStr) {
            const startTime = this.parseTimeString(startTimeStr);
            const endTime = this.parseTimeString(endTimeStr);
            
            if (startTime && endTime) {
                if (startTime > endTime) {
                    // Invalid range - red borders for both
                    startTimeInput.style.borderColor = '#ef4444';
                    startTimeInput.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
                    endTimeInput.style.borderColor = '#ef4444';
                    endTimeInput.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
                } else {
                    // Valid range - green borders for both
                    startTimeInput.style.borderColor = '#22c55e';
                    startTimeInput.style.backgroundColor = 'rgba(34, 197, 94, 0.1)';
                    endTimeInput.style.borderColor = '#22c55e';
                    endTimeInput.style.backgroundColor = 'rgba(34, 197, 94, 0.1)';
                }
            }
        }
    }
    
    showNotification(message) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 20px 30px;
            border-radius: 10px;
            font-size: 1.2rem;
            z-index: 1000;
            text-align: center;
            animation: fadeInOut 3s ease-in-out;
        `;
        
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }
    
    // Doodle Canvas Methods
    showDoodle() {
        console.log('Showing doodle modal...');
        
        // Ensure modal is hidden first
        this.doodleModal.classList.remove('show');
        
        // Force a reflow
        this.doodleModal.offsetHeight;
        
        // Add show class
        this.doodleModal.classList.add('show');
        
        console.log('Modal classes:', this.doodleModal.className);
        
        // Setup canvas immediately
        this.setupCanvas();
        
        // Also setup after a short delay to ensure modal is fully visible
        setTimeout(() => {
            this.setupCanvas();
            console.log('Canvas setup complete (delayed)');
        }, 100);
    }
    
    hideDoodle() {
        console.log('Hiding doodle modal...');
        this.doodleModal.classList.remove('show');
        // Clear canvas when hiding
        this.clearCanvas();
        console.log('Modal hidden, classes:', this.doodleModal.className);
    }
    
    closeDoodle() {
        console.log('Close doodle button clicked');
        this.stopRest();
    }
    
    setupCanvas() {
        if (!this.doodleCanvas) {
            console.error('Canvas element not found');
            return;
        }
        
        const ctx = this.doodleCanvas.getContext('2d');
        if (!ctx) {
            console.error('Could not get 2D context');
            return;
        }
        
        // Clear any existing content
        ctx.clearRect(0, 0, this.doodleCanvas.width, this.doodleCanvas.height);
        
        // Set up drawing properties
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.fillStyle = '#ffffff';
        
        // Fill with white background
        ctx.fillRect(0, 0, this.doodleCanvas.width, this.doodleCanvas.height);
        
        // Reset drawing state
        this.isDrawing = false;
        this.lastX = 0;
        this.lastY = 0;
        
        console.log('Canvas setup complete - ready for drawing');
        console.log('Canvas dimensions:', this.doodleCanvas.width, 'x', this.doodleCanvas.height);
    }
    
    clearCanvas() {
        const ctx = this.doodleCanvas.getContext('2d');
        ctx.clearRect(0, 0, this.doodleCanvas.width, this.doodleCanvas.height);
        // Fill with white background after clearing
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, this.doodleCanvas.width, this.doodleCanvas.height);
        // Reset stroke style
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    }
    
    startDrawing(e) {
        e.preventDefault(); // Prevent default behavior
        console.log('startDrawing called');
        this.isDrawing = true;
        const rect = this.doodleCanvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        // Calculate canvas coordinates
        const scaleX = this.doodleCanvas.width / rect.width;
        const scaleY = this.doodleCanvas.height / rect.height;
        
        this.lastX = (clientX - rect.left) * scaleX;
        this.lastY = (clientY - rect.top) * scaleY;
        
        console.log('Started drawing at:', this.lastX, this.lastY);
        console.log('Canvas rect:', rect);
        console.log('Scale:', scaleX, scaleY);
    }
    
    draw(e) {
        if (!this.isDrawing) return;
        
        e.preventDefault(); // Prevent default behavior
        console.log('draw called');
        
        const ctx = this.doodleCanvas.getContext('2d');
        const rect = this.doodleCanvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        // Calculate canvas coordinates with proper scaling
        const scaleX = this.doodleCanvas.width / rect.width;
        const scaleY = this.doodleCanvas.height / rect.height;
        
        const currentX = (clientX - rect.left) * scaleX;
        const currentY = (clientY - rect.top) * scaleY;
        
        console.log('Drawing from', this.lastX, this.lastY, 'to', currentX, currentY);
        
        ctx.beginPath();
        ctx.moveTo(this.lastX, this.lastY);
        ctx.lineTo(currentX, currentY);
        ctx.stroke();
        
        this.lastX = currentX;
        this.lastY = currentY;
    }
    
    stopDrawing() {
        this.isDrawing = false;
    }
    
    setupDragAndDrop() {
        // Add event listeners to all task containers
        const containers = [this.backlogTasks, this.todayTasks, this.completedTasks];
        
        containers.forEach(container => {
            // Allow dropping on containers
            container.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                
                const afterElement = this.getDragAfterElement(container, e.clientY);
                const dragging = document.querySelector('.dragging');
                
                if (afterElement == null) {
                    container.appendChild(dragging);
                } else {
                    container.insertBefore(dragging, afterElement);
                }
            });
            
            container.addEventListener('dragenter', (e) => {
                e.preventDefault();
                container.classList.add('drag-over');
            });
            
            container.addEventListener('dragleave', (e) => {
                // Only remove class if we're leaving the container itself, not a child
                if (!container.contains(e.relatedTarget)) {
                    container.classList.remove('drag-over');
                }
            });
            
            container.addEventListener('drop', (e) => {
                e.preventDefault();
                container.classList.remove('drag-over');
                
                const taskId = parseInt(e.dataTransfer.getData('text/plain'));
                const newState = this.getColumnState(container);
                
                if (taskId && newState) {
                    const task = this.tasks.find(t => t.id === taskId);
                    if (task) {
                        if (task.state !== newState) {
                            // Moving to different column
                            this.moveTask(taskId, newState);
                        } else {
                            // Reordering within same column
                            this.reorderTaskInColumn(taskId, container);
                        }
                    }
                }
            });
        });
        
        // Add event listeners to task items (delegated)
        document.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('task-item')) {
                e.target.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', e.target.dataset.taskId);
            }
        });
        
        document.addEventListener('dragend', (e) => {
            if (e.target.classList.contains('task-item')) {
                e.target.classList.remove('dragging');
                // Re-render to restore proper order from data
                this.renderTasks();
            }
        });
    }
    
    getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.task-item:not(.dragging)')];
        
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }
    
    reorderTaskInColumn(taskId, container) {
        const taskElements = container.querySelectorAll('.task-item');
        const newOrder = [];
        
        taskElements.forEach(element => {
            const id = parseInt(element.dataset.taskId);
            if (id) {
                newOrder.push(id);
            }
        });
        
        // Update task order in the tasks array
        const columnState = this.getColumnState(container);
        const tasksInColumn = this.tasks.filter(task => task.state === columnState);
        
        // Create new ordered array
        const reorderedTasks = [];
        newOrder.forEach(id => {
            const task = tasksInColumn.find(t => t.id === id);
            if (task) {
                reorderedTasks.push(task);
            }
        });
        
        // Update the main tasks array with new order
        const otherTasks = this.tasks.filter(task => task.state !== columnState);
        this.tasks = [...otherTasks, ...reorderedTasks];
        
        this.renderTasks();
    }
    
    getColumnState(container) {
        if (container === this.backlogTasks) {
            return this.TASK_STATES.BACKLOG;
        } else if (container === this.todayTasks) {
            return this.TASK_STATES.TODAY;
        } else if (container === this.completedTasks) {
            return this.TASK_STATES.COMPLETED;
        }
        return null;
    }
}

// Initialize the timer when the page loads
let taskTimer;
document.addEventListener('DOMContentLoaded', () => {
    taskTimer = new TaskTimer();
});