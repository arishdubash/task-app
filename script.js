class TaskTimer {
    constructor() {
        this.tasks = [];
        this.currentRunningTask = null;
        this.isRestMode = false;
        this.restTime = 5 * 60; // 5 minutes in seconds
        this.interval = null;
        this.pendingUndoAction = null;
        this.snackbarTimeoutId = null;
        // Default tags that cannot be deleted
        this.defaultTags = ['personal', 'chores', 'work'];
        this.allTags = [
            { name: 'personal', color: '#8B5CF6', isDefault: true },
            { name: 'chores', color: '#3B82F6', isDefault: true },
            { name: 'work', color: '#22C55E', isDefault: true }
        ]; // Track all existing tags across all tasks: [{name: string, color: string, isDefault: boolean}]
        
        // Available tag colors (8 common colors)
        this.tagColors = [
            { name: 'Purple', value: '#8B5CF6' },
            { name: 'Blue', value: '#3B82F6' },
            { name: 'Green', value: '#22C55E' },
            { name: 'Yellow', value: '#F59E0B' },
            { name: 'Red', value: '#EF4444' },
            { name: 'Pink', value: '#EC4899' },
            { name: 'Cyan', value: '#06B6D4' },
            { name: 'Orange', value: '#F97316' }
        ];
        
        // Task states
        this.TASK_STATES = {
            NONE: null,
            TODAY: 'today',
            IN_PROGRESS: 'in-progress',
            COMPLETE: 'complete'
        };
        
        this.initializeElements();
        this.loadFromLocalStorage();
        this.bindEvents();
        this.updateDisplay();
        this.renderFilterTabs();
        this.renderKanbanFilterTabs();
        // Set default view to Tasks
        this.switchView('tasks');
    }
    
    // LocalStorage Methods
    saveToLocalStorage() {
        try {
            // Save tasks - convert Date objects to ISO strings for JSON
            const tasksToSave = this.tasks.map(task => {
                const taskCopy = { ...task };
                if (taskCopy.startTime && taskCopy.startTime instanceof Date) {
                    taskCopy.startTime = taskCopy.startTime.toISOString();
                }
                if (taskCopy.endTime && taskCopy.endTime instanceof Date) {
                    taskCopy.endTime = taskCopy.endTime.toISOString();
                }
                if (taskCopy.sessions && taskCopy.sessions.length > 0) {
                    taskCopy.sessions = taskCopy.sessions.map(session => ({
                        ...session,
                        startTime: session.startTime instanceof Date ? session.startTime.toISOString() : session.startTime,
                        endTime: session.endTime instanceof Date ? session.endTime.toISOString() : session.endTime
                    }));
                }
                if (taskCopy.currentSessionStartTime && taskCopy.currentSessionStartTime instanceof Date) {
                    taskCopy.currentSessionStartTime = taskCopy.currentSessionStartTime.toISOString();
                }
                return taskCopy;
            });
            localStorage.setItem('pomodoro_tasks', JSON.stringify(tasksToSave));
            
            // Save tags
            localStorage.setItem('pomodoro_tags', JSON.stringify(this.allTags));
            
            // Save selected filter
            localStorage.setItem('pomodoro_selected_filter', this.selectedTagFilter);
        } catch (error) {
            console.error('Error saving to localStorage:', error);
        }
    }
    
    loadFromLocalStorage() {
        try {
            // Load tasks - convert ISO strings back to Date objects
            const savedTasks = localStorage.getItem('pomodoro_tasks');
            if (savedTasks) {
                const tasksData = JSON.parse(savedTasks);
                this.tasks = tasksData.map(task => {
                    const taskCopy = { ...task };
                    if (taskCopy.startTime) {
                        taskCopy.startTime = new Date(taskCopy.startTime);
                    }
                    if (taskCopy.endTime) {
                        taskCopy.endTime = new Date(taskCopy.endTime);
                    }
                    if (taskCopy.sessions && taskCopy.sessions.length > 0) {
                        taskCopy.sessions = taskCopy.sessions.map(session => ({
                            ...session,
                            startTime: new Date(session.startTime),
                            endTime: new Date(session.endTime)
                        }));
                    }
                    if (taskCopy.currentSessionStartTime) {
                        taskCopy.currentSessionStartTime = new Date(taskCopy.currentSessionStartTime);
                    }
                    return taskCopy;
                });
            }
            
            // Load tags - merge with default tags, preserving default tag colors if changed
            const savedTags = localStorage.getItem('pomodoro_tags');
            if (savedTags) {
                const tagsData = JSON.parse(savedTags);
                // Update default tags with saved colors if they were changed
                tagsData.forEach(savedTag => {
                    const defaultTagIndex = this.allTags.findIndex(t => t.name === savedTag.name && this.defaultTags.includes(t.name));
                    if (defaultTagIndex !== -1) {
                        // Update color of default tag if it was changed
                        this.allTags[defaultTagIndex].color = savedTag.color;
                    }
                });
                // Add user-created tags (not in default list)
                const defaultTagNames = new Set(this.defaultTags);
                const userTags = tagsData.filter(tag => !defaultTagNames.has(tag.name));
                this.allTags = [...this.allTags, ...userTags];
            }
            
            // Load selected filter
            const savedFilter = localStorage.getItem('pomodoro_selected_filter');
            if (savedFilter) {
                this.selectedTagFilter = savedFilter;
            }
        } catch (error) {
            console.error('Error loading from localStorage:', error);
        }
    }
    
    initializeElements() {
        this.startRestBtn = document.getElementById('start-rest-btn');
        this.taskInput = document.getElementById('task-input');
        this.addTaskBtn = document.getElementById('add-task-btn');
        this.restTimeInput = document.getElementById('rest-time');
        this.restTimeButtons = document.querySelectorAll('.time-btn[data-action*="rest"]');
        
        // Kanban board elements
        this.todayTasks = document.getElementById('today-tasks');
        this.inProgressTasks = document.getElementById('in-progress-tasks');
        this.completedTasks = document.getElementById('completed-tasks');
        this.todayCount = document.getElementById('today-count');
        this.inProgressCount = document.getElementById('in-progress-count');
        this.completedCount = document.getElementById('completed-count');
        
        // Tasks view elements
        this.thisWeekTasksBody = document.getElementById('this-week-tasks-body');
        this.laterTasksBody = document.getElementById('later-tasks-body');
        
        // Group selector elements
        this.groupThisWeekRadio = document.getElementById('group-this-week');
        this.groupLaterRadio = document.getElementById('group-later');
        
        // Modal elements
        this.addTaskModal = document.getElementById('add-task-modal');
        this.taskNameInput = document.getElementById('task-name-input');
        this.taskDescriptionInput = document.getElementById('task-description-input');
        this.taskTagsSelector = document.getElementById('task-tags-selector');
        this.addToTodayCheckbox = document.getElementById('add-to-today-checkbox');
        this.closeTaskModalBtn = document.getElementById('close-task-modal');
        this.cancelTaskBtn = document.getElementById('cancel-task-btn');
        this.saveTaskBtn = document.getElementById('save-task-btn');
        
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
        
        // Tag selector state
        this.currentTagSelectorTaskId = null;
        this.currentEditingTaskId = null;
        
        // Debounced save for timer updates
        this.saveTimerTimeout = null;
        
        // View elements
        this.tasksView = document.getElementById('tasks-view');
        this.kanbanView = document.getElementById('kanban-view');
        this.tagsView = document.getElementById('tags-view');
        this.newTagNameInput = document.getElementById('new-tag-name');
        this.createTagBtn = document.getElementById('create-tag-btn');
        this.tagsList = document.getElementById('tags-list');
        this.colorOptions = document.getElementById('color-options');
        this.selectedColor = this.tagColors[0].value;
        
        // Tag filter state
        this.selectedTagFilter = 'all';
        this.tagFilterTabs = document.getElementById('tag-filter-tabs');
        this.kanbanFilterTabs = document.getElementById('kanban-filter-tabs');
    }
    
    bindEvents() {
        if (this.startRestBtn) {
            this.startRestBtn.addEventListener('click', () => this.handleRestButtonClick());
        }
        if (this.addTaskBtn) {
            this.addTaskBtn.addEventListener('click', () => this.showAddTaskModal());
        }
        
        // Modal events
        if (this.closeTaskModalBtn) {
            this.closeTaskModalBtn.addEventListener('click', () => this.hideAddTaskModal());
        }
        if (this.cancelTaskBtn) {
            this.cancelTaskBtn.addEventListener('click', () => this.hideAddTaskModal());
        }
        if (this.saveTaskBtn) {
            this.saveTaskBtn.addEventListener('click', () => this.createTaskFromModal());
        }
        if (this.addTaskModal) {
            this.addTaskModal.addEventListener('click', (e) => {
                if (e.target === this.addTaskModal) {
                    this.hideAddTaskModal();
                }
            });
        }
        
        if (this.taskNameInput) {
            this.taskNameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.createTaskFromModal();
                }
            });
        }
        
        // Close tag selector when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.tag-selector-container') && !e.target.closest('.tag-btn')) {
                this.closeTagSelector();
            }
        });
        
        // Close tag selector when starting to drag
        document.addEventListener('mousedown', (e) => {
            const taskItem = e.target.closest('.task-item');
            if (taskItem) {
                // Check if this is a drag start (not clicking on interactive elements)
                const interactiveElements = ['button', 'input', 'a', 'select', 'textarea'];
                if (!interactiveElements.includes(e.target.tagName.toLowerCase()) && 
                    !e.target.closest('button') && 
                    !e.target.closest('input') &&
                    !e.target.closest('.tag-selector-container')) {
                    // Close tag selector when user starts dragging
                    this.closeTagSelector();
                }
            }
        });
        
        // View switching
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const view = item.dataset.view;
                this.switchView(view);
            });
        });
        
        // Tag management events
        if (this.createTagBtn) {
            this.createTagBtn.addEventListener('click', () => this.createTagFromManagement());
        }
        
        if (this.newTagNameInput) {
            this.newTagNameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.createTagFromManagement();
            });
        }
        
        // Initialize color picker
        this.initializeColorPicker();
        
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
    
    showAddTaskModal(taskId = null) {
        if (!this.addTaskModal) return;
        
        const task = taskId ? this.tasks.find(t => t.id === taskId) : null;
        
        // Clear or populate inputs
        if (this.taskNameInput) {
            this.taskNameInput.value = task ? task.name : '';
        }
        if (this.taskDescriptionInput) {
            this.taskDescriptionInput.value = task ? (task.description || '') : '';
        }
        if (this.addToTodayCheckbox) {
            this.addToTodayCheckbox.checked = task ? (task.state === this.TASK_STATES.TODAY) : false;
            const checkboxGroup = this.addToTodayCheckbox.closest('.checkbox-group');
            if (task) {
                // Hide checkbox group if editing existing task
                if (checkboxGroup) {
                    checkboxGroup.style.display = 'none';
                }
            } else {
                // Show checkbox group for new tasks
                if (checkboxGroup) {
                    checkboxGroup.style.display = 'block';
                }
                this.addToTodayCheckbox.disabled = false;
            }
        }
        
        // Set group radio buttons
        if (task) {
            if (this.groupThisWeekRadio && this.groupLaterRadio) {
                if (task.group === 'later') {
                    this.groupLaterRadio.checked = true;
                } else {
                    this.groupThisWeekRadio.checked = true;
                }
            }
        } else {
            // Default to thisWeek for new tasks
            if (this.groupThisWeekRadio) {
                this.groupThisWeekRadio.checked = true;
            }
        }
        
        // Store current editing task ID
        this.currentEditingTaskId = taskId;
        
        // Render tag selector with task's current tags selected
        this.renderModalTagSelector(task);
        
        // Update modal title and button
        const modalTitle = this.addTaskModal.querySelector('.modal-header h2');
        if (modalTitle) {
            modalTitle.textContent = task ? 'Edit Task' : 'Add New Task';
        }
        if (this.saveTaskBtn) {
            this.saveTaskBtn.textContent = task ? 'Save Changes' : 'Add Task';
        }
        
        // Show modal
        this.addTaskModal.classList.add('show');
        
        // Focus on task name input
        setTimeout(() => {
            if (this.taskNameInput) this.taskNameInput.focus();
        }, 100);
    }
    
    hideAddTaskModal() {
        if (this.addTaskModal) {
            this.addTaskModal.classList.remove('show');
            this.currentEditingTaskId = null;
            // Reset checkbox group visibility
            const checkboxGroup = this.addToTodayCheckbox ? this.addToTodayCheckbox.closest('.checkbox-group') : null;
            if (checkboxGroup) {
                checkboxGroup.style.display = 'block';
            }
        }
    }
    
    renderModalTagSelector(task = null) {
        if (!this.taskTagsSelector) return;
        
        this.taskTagsSelector.innerHTML = '';
        
        const taskTags = task && task.tags ? task.tags : [];
        
        this.allTags.forEach(tag => {
            const tagItem = document.createElement('div');
            tagItem.className = 'tag-checkbox-item';
            
            const isChecked = taskTags.includes(tag.name);
            if (isChecked) {
                tagItem.classList.add('checked');
            }
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `modal-tag-${tag.name}`;
            checkbox.value = tag.name;
            checkbox.checked = isChecked;
            
            const label = document.createElement('label');
            label.htmlFor = `modal-tag-${tag.name}`;
            label.className = 'tag-checkbox-label';
            label.textContent = tag.name;
            label.style.cssText = `display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 500; border: 1px solid ${tag.color}; background: ${tag.color}20; color: ${tag.color}; margin: 0;`;
            
            tagItem.appendChild(checkbox);
            tagItem.appendChild(label);
            
            // Update checked state when clicked
            tagItem.addEventListener('click', (e) => {
                if (e.target !== checkbox) {
                    checkbox.checked = !checkbox.checked;
                }
                tagItem.classList.toggle('checked', checkbox.checked);
            });
            
            this.taskTagsSelector.appendChild(tagItem);
        });
    }
    
    createTaskFromModal() {
        if (!this.taskNameInput) return;
        
        const taskName = this.taskNameInput.value.trim();
        if (!taskName) return;
        
        const description = this.taskDescriptionInput ? this.taskDescriptionInput.value.trim() : '';
        const addToToday = this.addToTodayCheckbox ? this.addToTodayCheckbox.checked : false;
        
        // Get selected tags
        const selectedTags = [];
        const checkboxes = this.taskTagsSelector.querySelectorAll('input[type="checkbox"]:checked');
        checkboxes.forEach(checkbox => {
            selectedTags.push(checkbox.value);
        });
        
        // If editing existing task
        if (this.currentEditingTaskId) {
            const task = this.tasks.find(t => t.id === this.currentEditingTaskId);
            if (task) {
                task.name = taskName;
                task.description = description;
                task.tags = selectedTags;
                // Update group
                if (this.groupThisWeekRadio && this.groupLaterRadio) {
                    task.group = this.groupThisWeekRadio.checked ? 'thisWeek' : 'later';
                }
                // Only update state if it was a new task being added to today
                // For editing, don't change the state via the checkbox
                if (!task.state || task.state === this.TASK_STATES.NONE) {
                    task.state = addToToday ? this.TASK_STATES.TODAY : this.TASK_STATES.NONE;
                }
            }
        } else {
            // Create new task
            const task = {
                id: Date.now(),
                name: taskName,
                description: description,
                timeSpent: 0,
                isRunning: false,
                isCompleted: false,
                startTime: null,
                endTime: null,
                state: addToToday ? this.TASK_STATES.TODAY : this.TASK_STATES.NONE,
                sessions: [],
                tags: selectedTags,
                group: (this.groupThisWeekRadio && this.groupThisWeekRadio.checked) ? 'thisWeek' : 'later'
            };
            
            this.tasks.push(task);
        }
        
        this.hideAddTaskModal();
        this.saveToLocalStorage();
        this.renderTasks();
        this.renderFilterTabs();
        this.renderKanbanFilterTabs();
    }
    
    editTaskFromTable(taskId) {
        this.showAddTaskModal(taskId);
    }
    
    renderTasks() {
        // Determine which view is active
        const isTasksView = this.tasksView && this.tasksView.style.display !== 'none';
        const isKanbanView = this.kanbanView && this.kanbanView.style.display !== 'none';
        
        // Filter tasks by selected tag
        let filteredTasks = this.tasks;
        if (this.selectedTagFilter !== 'all') {
            filteredTasks = this.tasks.filter(task => 
                task.tags && task.tags.includes(this.selectedTagFilter)
            );
        }
        
        if (isTasksView) {
            this.renderTasksTable(filteredTasks);
        } else if (isKanbanView) {
            this.renderKanbanBoard(filteredTasks);
        }
    }
    
    renderTasksTable(tasks) {
        if (!this.thisWeekTasksBody || !this.laterTasksBody) return;
        
        // Ensure all tasks have a group (default to thisWeek)
        tasks.forEach(task => {
            if (!task.group) {
                task.group = 'thisWeek';
            }
        });
        
        // Split tasks by group - show all tasks regardless of board state
        const thisWeekTasks = tasks.filter(task => 
            (!task.group || task.group === 'thisWeek')
        );
        const laterTasks = tasks.filter(task => 
            task.group === 'later'
        );
        
        // Clear both tables
        this.thisWeekTasksBody.innerHTML = '';
        this.laterTasksBody.innerHTML = '';
        
        // Render This Week tasks
        if (thisWeekTasks.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="6" style="text-align: center; padding: 40px; color: var(--text-tertiary);">No tasks this week. Click "Add Task" to create one!</td>`;
            this.thisWeekTasksBody.appendChild(row);
        } else {
            thisWeekTasks.forEach(task => {
                this.renderTaskRow(task, this.thisWeekTasksBody);
            });
        }
        
        // Render Later tasks
        if (laterTasks.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="6" style="text-align: center; padding: 40px; color: var(--text-tertiary);">No tasks for later.</td>`;
            this.laterTasksBody.appendChild(row);
        } else {
            laterTasks.forEach(task => {
                this.renderTaskRow(task, this.laterTasksBody);
            });
        }
        
        // Setup drag and drop for task rows
        this.setupTaskTableDragAndDrop();
    }
    
    renderTaskRow(task, tbody) {
        const row = document.createElement('tr');
        row.className = 'task-row';
        row.draggable = true;
        row.dataset.taskId = task.id;
        row.dataset.taskGroup = task.group || 'thisWeek';
        
        const isCompleted = task.isCompleted || task.state === this.TASK_STATES.COMPLETE;
        
        // Checkbox column
        const checkboxCell = document.createElement('td');
        checkboxCell.className = 'checkbox-col';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'table-checkbox';
        checkbox.checked = isCompleted;
        checkbox.addEventListener('change', () => this.toggleTaskCompletionFromTable(task.id));
        checkboxCell.appendChild(checkbox);
        
        // Name column
        const nameCell = document.createElement('td');
        nameCell.className = 'name-col';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'task-name-clickable';
        nameSpan.textContent = task.name;
        if (isCompleted) {
            nameSpan.style.textDecoration = 'line-through';
            nameSpan.style.opacity = '0.6';
        }
        nameSpan.addEventListener('click', () => this.editTaskFromTable(task.id));
        nameCell.appendChild(nameSpan);
        
        // Description column
        const descCell = document.createElement('td');
        descCell.className = 'description-col';
        descCell.textContent = task.description || '—';
        descCell.style.color = task.description ? 'var(--text-secondary)' : 'var(--text-tertiary)';
        
        // Tags column
        const tagsCell = document.createElement('td');
        tagsCell.className = 'tags-col';
        const tagsContainer = document.createElement('div');
        tagsContainer.className = 'table-tags';
        if (task.tags && task.tags.length > 0) {
            task.tags.forEach(tagName => {
                const tag = this.getTagByName(tagName);
                if (tag) {
                    const tagSpan = document.createElement('span');
                    tagSpan.className = 'task-tag';
                    const transparentBg = this.hexToRgba(tag.color, 0.15);
                    tagSpan.style.cssText = `background: ${transparentBg}; color: ${tag.color}`;
                    tagSpan.textContent = tagName;
                    tagsContainer.appendChild(tagSpan);
                }
            });
        } else {
            tagsContainer.textContent = '—';
            tagsContainer.style.color = 'var(--text-tertiary)';
        }
        tagsCell.appendChild(tagsContainer);
        
        // Status column
        const statusCell = document.createElement('td');
        statusCell.className = 'status-col';
        if (!task.state || task.state === this.TASK_STATES.NONE) {
            // Show "Add to Board" button instead of "None"
            const addToBoardBtn = document.createElement('button');
            addToBoardBtn.className = 'table-action-btn primary';
            addToBoardBtn.textContent = 'Add to Board';
            addToBoardBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.moveTaskToBoard(task.id);
            });
            statusCell.appendChild(addToBoardBtn);
        } else {
            const statusSpan = document.createElement('span');
            statusSpan.className = 'table-status';
            if (task.state === this.TASK_STATES.TODAY) {
                statusSpan.className += ' today';
                statusSpan.textContent = 'Today';
            } else if (task.state === this.TASK_STATES.IN_PROGRESS) {
                statusSpan.className += ' in-progress';
                statusSpan.textContent = 'In Progress';
            } else if (task.state === this.TASK_STATES.COMPLETE) {
                statusSpan.className += ' complete';
                statusSpan.textContent = 'Complete';
            }
            statusCell.appendChild(statusSpan);
        }
        
        // Delete button column (no header needed)
        const deleteCell = document.createElement('td');
        deleteCell.className = 'delete-col';
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'table-action-btn danger small-icon';
        deleteBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6"/></svg>`;
        deleteBtn.title = 'Delete task';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteTask(task.id);
        });
        deleteCell.appendChild(deleteBtn);
        
        // Append all cells
        row.appendChild(checkboxCell);
        row.appendChild(nameCell);
        row.appendChild(descCell);
        row.appendChild(tagsCell);
        row.appendChild(statusCell);
        row.appendChild(deleteCell);
        
        tbody.appendChild(row);
    }
    
    setupTaskTableDragAndDrop() {
        const taskRows = document.querySelectorAll('.task-row');
        const thisWeekBody = this.thisWeekTasksBody;
        const laterBody = this.laterTasksBody;
        
        taskRows.forEach(row => {
            row.addEventListener('dragstart', (e) => {
                // Don't drag if clicking on interactive elements
                if (e.target.tagName === 'BUTTON' || 
                    e.target.tagName === 'INPUT' || 
                    e.target.closest('button') || 
                    e.target.closest('input') ||
                    e.target.closest('.task-name-clickable')) {
                    e.preventDefault();
                    return;
                }
                
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', row.dataset.taskId);
                row.classList.add('dragging');
            });
            
            row.addEventListener('dragend', () => {
                row.classList.remove('dragging');
            });
        });
        
        [thisWeekBody, laterBody].forEach(tbody => {
            tbody.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                
                const dragging = document.querySelector('.task-row.dragging');
                if (!dragging) return;
                
                tbody.classList.add('drag-over');
                
                const afterElement = this.getDragAfterRow(tbody, e.clientY);
                if (afterElement == null) {
                    tbody.appendChild(dragging);
                } else {
                    tbody.insertBefore(dragging, afterElement);
                }
            });
            
            tbody.addEventListener('dragleave', (e) => {
                if (!tbody.contains(e.relatedTarget)) {
                    tbody.classList.remove('drag-over');
                }
            });
            
            tbody.addEventListener('drop', (e) => {
                e.preventDefault();
                tbody.classList.remove('drag-over');
                
                const taskId = parseInt(e.dataTransfer.getData('text/plain'));
                const task = this.tasks.find(t => t.id === taskId);
                
                if (task) {
                    // Determine new group based on tbody
                    const newGroup = tbody === thisWeekBody ? 'thisWeek' : 'later';
                    task.group = newGroup;
                    
                    // Update row order
                    const rows = Array.from(tbody.querySelectorAll('.task-row'));
                    const newOrder = rows.map(row => parseInt(row.dataset.taskId));
                    this.reorderTasksInGroup(newGroup, newOrder);
                    
                    this.renderTasks();
                }
            });
        });
    }
    
    getDragAfterRow(tbody, y) {
        const draggableElements = [...tbody.querySelectorAll('.task-row:not(.dragging)')];
        
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
    
    reorderTasksInGroup(group, newOrder) {
        const tasksInGroup = this.tasks.filter(task => 
            (task.group || 'thisWeek') === group
        );
        
        const reorderedTasks = [];
        newOrder.forEach(id => {
            const task = tasksInGroup.find(t => t.id === id);
            if (task) {
                reorderedTasks.push(task);
            }
        });
        
        // Add any tasks in this group that weren't in the newOrder (shouldn't happen but just in case)
        const orderedTaskIds = new Set(newOrder);
        tasksInGroup.forEach(task => {
            if (!orderedTaskIds.has(task.id)) {
                reorderedTasks.push(task);
            }
        });
        
        // Get all other tasks (not in this group)
        const otherTasks = this.tasks.filter(task => 
            (task.group || 'thisWeek') !== group
        );
        
        // Combine: other tasks + reordered tasks in this group
        this.tasks = [...otherTasks, ...reorderedTasks];
        this.saveToLocalStorage();
    }
    
    renderKanbanBoard(tasks) {
        if (!this.todayTasks || !this.inProgressTasks || !this.completedTasks) return;
        
        // Clear all columns
        this.todayTasks.innerHTML = '';
        this.inProgressTasks.innerHTML = '';
        this.completedTasks.innerHTML = '';
        
        // Group tasks by state
        const todayTasks = tasks.filter(task => task.state === this.TASK_STATES.TODAY);
        const inProgressTasks = tasks.filter(task => task.state === this.TASK_STATES.IN_PROGRESS);
        const completedTasks = tasks.filter(task => task.state === this.TASK_STATES.COMPLETE || task.isCompleted);
        
        // Update counts
        if (this.todayCount) this.todayCount.textContent = todayTasks.length;
        if (this.inProgressCount) this.inProgressCount.textContent = inProgressTasks.length;
        if (this.completedCount) this.completedCount.textContent = completedTasks.length;
        
        // Render each column
        this.renderTaskColumn(todayTasks, this.todayTasks, this.TASK_STATES.TODAY);
        this.renderTaskColumn(inProgressTasks, this.inProgressTasks, this.TASK_STATES.IN_PROGRESS);
        this.renderTaskColumn(completedTasks, this.completedTasks, this.TASK_STATES.COMPLETE);
    }
    
    toggleTaskCompletionFromTable(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;
        
        // Toggle completion
        task.isCompleted = !task.isCompleted;
        
        // If completing, move to Complete state
        if (task.isCompleted) {
            task.state = this.TASK_STATES.COMPLETE;
        } else {
            // If uncompleting and was in complete state, move back to None
            if (task.state === this.TASK_STATES.COMPLETE) {
                task.state = this.TASK_STATES.NONE;
            }
        }
        
        // If task is running, pause it
        if (task.isRunning) {
            this.pauseTask(taskId);
        }
        
        this.saveToLocalStorage();
        this.renderTasks();
        this.renderKanbanFilterTabs();
    }
    
    moveTaskToBoard(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;
        
        // Move to Today state
        task.state = this.TASK_STATES.TODAY;
        task.isCompleted = false;
        
        this.renderTasks();
        this.renderKanbanFilterTabs();
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
                // Edit mode for Kanban cards
                if (columnState === this.TASK_STATES.TODAY || columnState === this.TASK_STATES.IN_PROGRESS) {
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
                // Normal mode layout for Kanban board
                if (columnState === this.TASK_STATES.TODAY) {
                    // Compact TODAY column cards
                    const kanbanTags = task.tags && task.tags.length > 0 ? this.renderTagsReadOnly(task.tags) : '';
                    taskElement.className += ' today-card';
                    taskElement.onclick = (e) => {
                        // Only trigger if clicking directly on the card, not on checkbox or remove button
                        if (e.target.closest('.today-checkbox') || e.target.closest('.today-remove-btn')) {
                            return;
                        }
                        this.editTaskFromTable(task.id);
                    };
                    taskElement.innerHTML = `
                        <div class="today-card-header">
                            <input type="checkbox" class="today-checkbox" ${task.isCompleted ? 'checked' : ''} 
                                 onchange="event.stopPropagation(); taskTimer.toggleTaskCompletion(${task.id})"
                                 onclick="event.stopPropagation()">
                            <div class="today-card-content">
                                <div class="today-card-title ${task.isCompleted ? 'completed' : ''}">${task.name}</div>
                                ${kanbanTags ? `<div class="today-card-tags">${kanbanTags}</div>` : ''}
                            </div>
                            <button class="today-remove-btn" onclick="event.stopPropagation(); taskTimer.removeFromKanban(${task.id})" title="Remove from kanban">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M18 6L6 18M6 6l12 12"/>
                                </svg>
                            </button>
                        </div>
                    `;
                } else if (columnState === this.TASK_STATES.IN_PROGRESS) {
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
                    
                    const kanbanTags = task.tags && task.tags.length > 0 ? this.renderTags(task.tags, task.id) : '';
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
                        ${task.description ? `<div class="task-description" style="font-size: 12px; color: var(--text-secondary); margin-top: 8px;">${task.description}</div>` : ''}
                        ${kanbanTags ? `<div class="task-tags">${kanbanTags}</div>` : ''}
                        ${timeInfoHtml}
                    `;
                } else {
                    // Normal mode layout for completed column
                    let controls = this.getTaskControls(task, columnState);
                    
                    const completedTags = task.tags && task.tags.length > 0 ? this.renderTags(task.tags, task.id) : '';
                    taskElement.innerHTML = `
                        <div class="task-header">
                            <div class="task-checkbox ${task.isCompleted ? 'checked' : ''}" 
                                 onclick="taskTimer.toggleTaskCompletion(${task.id})"></div>
                            <div class="task-name ${task.isCompleted ? 'completed' : ''}">${task.name}</div>
                        </div>
                        ${task.description ? `<div class="task-description" style="font-size: 12px; color: var(--text-secondary); margin-top: 8px;">${task.description}</div>` : ''}
                        ${completedTags ? `<div class="task-tags">${completedTags}</div>` : ''}
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
        
        // Add tag button to all task types
        const tagButton = `<button class="task-btn tag-btn" onclick="taskTimer.openTagSelector(${task.id})" title="Add tags">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                                <line x1="7" y1="7" x2="7.01" y2="7"/>
                            </svg>
                        </button>`;
        
        if (columnState === this.TASK_STATES.TODAY || columnState === this.TASK_STATES.IN_PROGRESS) {
            // Controls for Today and In Progress cards - tag, play/pause and delete
            controls += tagButton;
            if (!task.isCompleted && columnState === this.TASK_STATES.TODAY) {
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
            // Controls for completed column
            controls += tagButton;
            
            // Archive button (placeholder for now)
            controls += `<button class="task-btn" onclick="taskTimer.archiveTask(${task.id})" title="Archive task">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                                <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                                <line x1="12" y1="22.08" x2="12" y2="12"/>
                            </svg>
                        </button>`;
            
            // Delete button
            controls += `<button class="task-btn delete-btn" onclick="taskTimer.deleteTask(${task.id})" title="Delete task">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6"/>
                            </svg>
                        </button>`;
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
        
        // If task is completed, uncomplete it first
        if (task.isCompleted) {
            task.isCompleted = false;
            task.state = this.TASK_STATES.TODAY;
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
        
        // If moving to today or in-progress, ensure it's not completed
        if (newState === this.TASK_STATES.TODAY || newState === this.TASK_STATES.IN_PROGRESS) {
            task.isCompleted = false;
        }
        
        // If moving to complete, mark as completed
        if (newState === this.TASK_STATES.COMPLETE) {
            task.isCompleted = true;
            if (task.isRunning) {
                this.pauseTask(taskId);
            }
            if (task.startTime && !task.endTime) {
                task.endTime = new Date();
            }
        }
        
        this.saveToLocalStorage();
        this.renderTasks();
        this.renderKanbanFilterTabs();
        
        // Trigger confetti if completing
        if (newState === this.TASK_STATES.COMPLETE) {
            setTimeout(() => {
                const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
                if (taskElement) {
                    this.triggerConfetti(taskElement);
                }
            }, 10);
        }
    }
    
    archiveTask(taskId) {
        // Placeholder for archive functionality
        this.showNotification('Archive functionality coming soon!');
    }
    
    toggleTaskCompletion(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;
        
        // If task is running, pause it first
        if (task.isRunning) {
            this.pauseTask(taskId);
        }
        
        const wasCompleted = task.isCompleted;
        task.isCompleted = !task.isCompleted;
        
        // If completing the task, move it to completed column and set end time
        if (task.isCompleted && !wasCompleted) {
            task.state = this.TASK_STATES.COMPLETE;
            if (task.startTime && !task.endTime) {
                task.endTime = new Date();
            }
            // Render first to ensure task element exists
            this.saveToLocalStorage();
            this.renderTasks();
            this.renderKanbanFilterTabs();
            // Trigger confetti animation after a short delay to ensure DOM is updated
            setTimeout(() => {
                const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
                if (taskElement) {
                    this.triggerConfetti(taskElement);
                }
            }, 10);
            return;
        }
        
        // If uncompleting, move back to appropriate state
        if (!task.isCompleted && wasCompleted) {
            if (task.state === this.TASK_STATES.COMPLETE) {
                task.state = this.TASK_STATES.NONE;
            }
        }
        
        this.saveToLocalStorage();
        this.renderTasks();
        this.renderKanbanFilterTabs();
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
        
        this.saveToLocalStorage();
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
        this.saveToLocalStorage();
        this.renderTasks();
    }
    
    deleteTask(taskId) {
        this.tasks = this.tasks.filter(t => t.id !== taskId);
        if (this.currentRunningTask === taskId) {
            this.currentRunningTask = null;
            this.stopTimer();
        }
        this.saveToLocalStorage();
        this.renderTasks();
        this.renderFilterTabs();
    }
    
    removeFromKanban(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;
        
        // Store the previous state for undo
        const previousState = task.state;
        
        // Remove from kanban board by setting state to NONE
        task.state = this.TASK_STATES.NONE;
        
        // Save and re-render
        this.saveToLocalStorage();
        this.renderTasks();
        this.renderKanbanFilterTabs();
        
        // Show snackbar with undo
        this.showSnackbar(`Task removed from kanban board`, () => {
            // Undo: restore previous state
            task.state = previousState;
            this.saveToLocalStorage();
            this.renderTasks();
            this.renderKanbanFilterTabs();
        });
    }
    
    showSnackbar(message, onUndo) {
        // Remove existing snackbar if any
        const existingSnackbar = document.querySelector('.snackbar');
        if (existingSnackbar) {
            existingSnackbar.remove();
        }
        
        // Clear any pending timeout
        if (this.snackbarTimeoutId) {
            clearTimeout(this.snackbarTimeoutId);
            this.snackbarTimeoutId = null;
        }
        
        // Create snackbar element
        const snackbar = document.createElement('div');
        snackbar.className = 'snackbar';
        
        // Store undo action
        this.pendingUndoAction = onUndo;
        
        const undoButton = onUndo ? '<button class="snackbar-undo">Undo</button>' : '';
        snackbar.innerHTML = `
            <span class="snackbar-message">${message}</span>
            ${undoButton}
        `;
        
        document.body.appendChild(snackbar);
        
        // Setup undo button handler
        if (onUndo) {
            const undoBtn = snackbar.querySelector('.snackbar-undo');
            if (undoBtn) {
                undoBtn.onclick = () => {
                    if (this.pendingUndoAction) {
                        this.pendingUndoAction();
                        this.pendingUndoAction = null;
                    }
                    this.hideSnackbar();
                };
            }
        }
        
        // Show snackbar
        setTimeout(() => {
            snackbar.classList.add('show');
        }, 10);
        
        // Auto-hide after 5 seconds
        this.snackbarTimeoutId = setTimeout(() => {
            this.hideSnackbar();
        }, 5000);
    }
    
    hideSnackbar() {
        const snackbar = document.querySelector('.snackbar');
        if (snackbar) {
            snackbar.classList.remove('show');
            setTimeout(() => {
                snackbar.remove();
            }, 300);
        }
        if (this.snackbarTimeoutId) {
            clearTimeout(this.snackbarTimeoutId);
            this.snackbarTimeoutId = null;
        }
        this.pendingUndoAction = null;
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
            if (task.state === this.TASK_STATES.TODAY || task.state === this.TASK_STATES.IN_PROGRESS) {
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
        if (task.state === this.TASK_STATES.TODAY || task.state === this.TASK_STATES.IN_PROGRESS) {
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
        
        // Handle description if editing from table (we'll add this later if needed)
        // For now, descriptions are only set when creating tasks
        
        // Handle duration inputs (only for tasks on the board)
        if (task.state && task.state !== this.TASK_STATES.NONE && hoursInput && minutesInput && secondsInput) {
            const hours = parseInt(hoursInput.value) || 0;
            const minutes = parseInt(minutesInput.value) || 0;
            const seconds = parseInt(secondsInput.value) || 0;
            
            // Validate ranges
            if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 && seconds >= 0 && seconds <= 59) {
                task.timeSpent = hours * 3600 + minutes * 60 + seconds;
            }
        }
        
        // Handle time range inputs (only for tasks on the board)
        if (task.state && task.state !== this.TASK_STATES.NONE && startTimeInput && endTimeInput) {
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
        this.saveToLocalStorage();
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
                    // Debounced save every 5 seconds while timer is running
                    if (!this.saveTimerTimeout) {
                        this.saveTimerTimeout = setTimeout(() => {
                            this.saveToLocalStorage();
                            this.saveTimerTimeout = null;
                        }, 5000);
                    }
                }
            }
        }, 1000);
    }
    
    stopTimer() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        // Save immediately when timer stops
        if (this.saveTimerTimeout) {
            clearTimeout(this.saveTimerTimeout);
            this.saveTimerTimeout = null;
        }
        this.saveToLocalStorage();
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
        const containers = [this.todayTasks, this.inProgressTasks, this.completedTasks];
        
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
            // Find the closest task-item parent, even if clicking on a child element
            const taskItem = e.target.closest('.task-item');
            if (taskItem) {
                // Close tag selector if open
                this.closeTagSelector();
                
                // Don't allow drag if clicking on interactive elements (buttons, inputs, etc.)
                const interactiveElements = ['button', 'input', 'a', 'select', 'textarea'];
                if (interactiveElements.includes(e.target.tagName.toLowerCase()) || 
                    e.target.closest('button') || 
                    e.target.closest('input') ||
                    e.target.closest('.tag-selector-container')) {
                    e.preventDefault();
                    return;
                }
                
                taskItem.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', taskItem.dataset.taskId);
            }
        });
        
        document.addEventListener('dragend', (e) => {
            const taskItem = e.target.closest('.task-item');
            if (taskItem) {
                taskItem.classList.remove('dragging');
                // Re-render to restore proper order from data
                this.renderTasks();
            }
        });
    }
    
    // View Management
    switchView(viewName) {
        // Update nav items
        document.querySelectorAll('.nav-item').forEach(item => {
            if (item.dataset.view === viewName) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
        
        // Switch views
        if (viewName === 'tags') {
            if (this.tasksView) this.tasksView.style.display = 'none';
            if (this.kanbanView) this.kanbanView.style.display = 'none';
            if (this.tagsView) this.tagsView.style.display = 'block';
            this.renderTagsManagement();
        } else if (viewName === 'kanban') {
            if (this.tasksView) this.tasksView.style.display = 'none';
            if (this.tagsView) this.tagsView.style.display = 'none';
            if (this.kanbanView) this.kanbanView.style.display = 'block';
            this.renderTasks();
            this.renderKanbanFilterTabs();
        } else {
            // Tasks view
            if (this.kanbanView) this.kanbanView.style.display = 'none';
            if (this.tagsView) this.tagsView.style.display = 'none';
            if (this.tasksView) this.tasksView.style.display = 'block';
            this.renderTasks();
            this.renderFilterTabs();
        }
    }
    
    // Tag Management Methods
    initializeColorPicker() {
        if (!this.colorOptions) return;
        
        this.colorOptions.innerHTML = '';
        this.tagColors.forEach(color => {
            const colorBtn = document.createElement('button');
            colorBtn.className = 'color-option';
            colorBtn.style.backgroundColor = color.value;
            colorBtn.dataset.color = color.value;
            if (color.value === this.selectedColor) {
                colorBtn.classList.add('selected');
            }
            colorBtn.onclick = () => {
                this.selectedColor = color.value;
                document.querySelectorAll('.color-option').forEach(btn => {
                    btn.classList.remove('selected');
                });
                colorBtn.classList.add('selected');
            };
            this.colorOptions.appendChild(colorBtn);
        });
    }
    
    createTagFromManagement() {
        const tagName = this.newTagNameInput.value.trim().toLowerCase();
        if (!tagName) return;
        
        // Check if tag already exists
        if (this.allTags.find(t => t.name === tagName)) {
            this.showNotification('Tag already exists!');
            return;
        }
        
        // Create tag
        this.allTags.push({
            name: tagName,
            color: this.selectedColor
        });
        
        // Clear input
        this.newTagNameInput.value = '';
        this.selectedColor = this.tagColors[0].value;
        this.initializeColorPicker();
        
        // Refresh tag list
        this.saveToLocalStorage();
        this.renderTagsManagement();
        this.renderFilterTabs();
        this.showNotification('Tag created!');
    }
    
    deleteTag(tagName) {
        // Prevent deletion of default tags
        if (this.defaultTags.includes(tagName)) {
            this.showNotification('Default tags cannot be deleted!');
            return;
        }
        
        // Remove from allTags
        this.allTags = this.allTags.filter(tag => tag.name !== tagName);
        
        // Remove from all tasks
        this.tasks.forEach(task => {
            if (task.tags) {
                task.tags = task.tags.filter(t => t !== tagName);
            }
        });
        
        // Refresh views
        this.saveToLocalStorage();
        this.renderTagsManagement();
        this.renderTasks();
        this.renderFilterTabs();
        this.renderKanbanFilterTabs();
        this.showNotification('Tag deleted!');
        
        // Reset filter to 'all' if deleted tag was selected
        if (this.selectedTagFilter === tagName) {
            this.selectedTagFilter = 'all';
            this.renderFilterTabs();
            this.renderKanbanFilterTabs();
        }
    }
    
    changeTagColor(tagName, newColor) {
        const tag = this.allTags.find(t => t.name === tagName);
        if (tag) {
            tag.color = newColor;
            this.saveToLocalStorage();
            this.renderTagsManagement();
            this.renderTasks();
            this.showNotification('Tag color updated!');
        }
    }
    
    renderTagsManagement() {
        if (!this.tagsList) return;
        
        this.tagsList.innerHTML = '';
        
        if (this.allTags.length === 0) {
            this.tagsList.innerHTML = '<div class="no-tags">No tags created yet. Create your first tag above!</div>';
            return;
        }
        
        this.allTags.forEach(tag => {
            const isDefault = this.defaultTags.includes(tag.name);
            const tagItem = document.createElement('div');
            tagItem.className = 'tag-management-item';
            
            const tagPreview = document.createElement('div');
            tagPreview.className = 'tag-preview';
            const transparentBg = this.hexToRgba(tag.color, 0.15);
            tagPreview.style.cssText = `background: ${transparentBg}; color: ${tag.color}`;
            tagPreview.textContent = tag.name;
            
            const tagActions = document.createElement('div');
            tagActions.className = 'tag-actions';
            
            const colorSelector = document.createElement('div');
            colorSelector.className = 'tag-color-selector';
            
            const colorLabel = document.createElement('span');
            colorLabel.className = 'color-label';
            colorLabel.textContent = 'Color:';
            
            const colorOptions = document.createElement('div');
            colorOptions.className = 'tag-color-options';
            
            this.tagColors.forEach(color => {
                const colorBtn = document.createElement('button');
                colorBtn.className = `tag-color-option ${tag.color === color.value ? 'selected' : ''}`;
                colorBtn.style.backgroundColor = color.value;
                colorBtn.title = color.name;
                colorBtn.onclick = () => this.changeTagColor(tag.name, color.value);
                colorOptions.appendChild(colorBtn);
            });
            
            colorSelector.appendChild(colorLabel);
            colorSelector.appendChild(colorOptions);
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-tag-btn';
            deleteBtn.title = isDefault ? 'Default tags cannot be deleted' : 'Delete tag';
            deleteBtn.disabled = isDefault;
            if (isDefault) {
                deleteBtn.style.opacity = '0.3';
                deleteBtn.style.cursor = 'not-allowed';
            }
            deleteBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6"/>
                </svg>
            `;
            if (!isDefault) {
                deleteBtn.onclick = () => this.deleteTag(tag.name);
            }
            
            tagActions.appendChild(colorSelector);
            tagActions.appendChild(deleteBtn);
            
            tagItem.appendChild(tagPreview);
            tagItem.appendChild(tagActions);
            
            this.tagsList.appendChild(tagItem);
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
        
        this.saveToLocalStorage();
        this.renderTasks();
    }
    
    getColumnState(container) {
        if (container === this.todayTasks) {
            return this.TASK_STATES.TODAY;
        } else if (container === this.inProgressTasks) {
            return this.TASK_STATES.IN_PROGRESS;
        } else if (container === this.completedTasks) {
            return this.TASK_STATES.COMPLETE;
        }
        return null;
    }
    
    // Tag Management Methods
    openTagSelector(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;
        
        // Initialize tags if needed
        if (!task.tags) {
            task.tags = [];
        }
        
        // Close any existing selector
        this.closeTagSelector();
        
        this.currentTagSelectorTaskId = taskId;
        
        // Find the task element and create selector
        const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
        if (!taskElement) return;
        
        // Remove existing selector if any
        const existingSelector = taskElement.querySelector('.tag-selector-container');
        if (existingSelector) {
            existingSelector.remove();
        }
        
        // Create tag selector
        const selector = document.createElement('div');
        selector.className = 'tag-selector-container';
        selector.innerHTML = this.renderTagSelector(task);
        
        // Position it relative to the tag button
        const tagButton = taskElement.querySelector('.tag-btn');
        if (tagButton) {
            const rect = tagButton.getBoundingClientRect();
            const taskRect = taskElement.getBoundingClientRect();
            selector.style.position = 'absolute';
            selector.style.top = `${rect.bottom - taskRect.top + 4}px`;
            selector.style.right = `${taskRect.right - rect.right}px`;
            selector.style.zIndex = '1000';
        }
        
        taskElement.style.position = 'relative';
        taskElement.appendChild(selector);
        
        // Set up event handlers
        const input = selector.querySelector('.tag-selector-input');
        if (input) {
            input.addEventListener('input', (e) => this.handleTagSearch(e.target, taskId));
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.createTagFromInput(e.target, taskId);
                }
            });
            setTimeout(() => input.focus(), 10);
        }
        
        // Set up create button
        const createBtn = selector.querySelector('.tag-selector-create-btn');
        if (createBtn) {
            createBtn.onclick = () => {
                if (input && input.value.trim()) {
                    this.createTagFromInput(input, taskId);
                }
            };
        }
    }
    
    closeTagSelector() {
        if (this.currentTagSelectorTaskId) {
            const taskElement = document.querySelector(`[data-task-id="${this.currentTagSelectorTaskId}"]`);
            if (taskElement) {
                const selector = taskElement.querySelector('.tag-selector-container');
                if (selector) selector.remove();
            }
            this.currentTagSelectorTaskId = null;
        }
    }
    
    renderTagSelector(task) {
        const taskTags = task.tags || [];
        const searchValue = '';
        
        // Get filtered tags based on search
        const filteredTags = this.allTags.filter(tag => 
            !searchValue || tag.name.includes(searchValue.toLowerCase())
        );
        
        let html = `
            <div class="tag-selector">
                <div class="tag-selector-header">
                    <input type="text" class="tag-selector-input" placeholder="Search or create tag..." 
                           oninput="taskTimer.handleTagSearch(this, ${task.id})"
                           onkeydown="if(event.key==='Enter') taskTimer.createTagFromInput(this, ${task.id})">
                </div>
                <div class="tag-selector-list" id="tag-list-${task.id}">
        `;
        
        // Show existing tags with checkboxes
        filteredTags.forEach(tag => {
            const isChecked = taskTags.includes(tag.name);
            html += `
                <div class="tag-selector-item" onclick="taskTimer.toggleTaskTag(${task.id}, '${tag.name}')">
                    <input type="checkbox" ${isChecked ? 'checked' : ''} 
                           onclick="event.stopPropagation(); taskTimer.toggleTaskTag(${task.id}, '${tag.name}')">
                    <span class="tag-selector-tag" style="background: ${tag.color}20; border-color: ${tag.color}; color: ${tag.color}">${tag.name}</span>
                </div>
            `;
        });
        
        html += `
                </div>
                <div class="tag-selector-footer">
                    <button class="tag-selector-create-btn" onclick="taskTimer.createTagFromInput(document.querySelector('#tag-list-${task.id}').previousElementSibling.querySelector('input'), ${task.id})">
                        + Create tag
                    </button>
                </div>
            </div>
        `;
        
        return html;
    }
    
    handleTagSearch(input, taskId) {
        const searchValue = input.value.trim().toLowerCase();
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;
        
        const taskTags = task.tags || [];
        const listElement = document.getElementById(`tag-list-${taskId}`);
        if (!listElement) return;
        
        // Filter tags
        const filteredTags = this.allTags.filter(tag => 
            !searchValue || tag.name.includes(searchValue)
        );
        
        listElement.innerHTML = '';
        
        // Show filtered existing tags
        filteredTags.forEach(tag => {
            const isChecked = taskTags.includes(tag.name);
            const item = document.createElement('div');
            item.className = 'tag-selector-item';
            item.innerHTML = `
                <input type="checkbox" ${isChecked ? 'checked' : ''} 
                       onclick="event.stopPropagation(); taskTimer.toggleTaskTag(${taskId}, '${tag.name}')">
                <span class="tag-selector-tag" style="background: ${tag.color}20; border-color: ${tag.color}; color: ${tag.color}">${tag.name}</span>
            `;
            item.onclick = () => this.toggleTaskTag(taskId, tag.name);
            listElement.appendChild(item);
        });
        
        // Show create option if search value doesn't exist
        if (searchValue && !this.allTags.find(t => t.name === searchValue)) {
            const createItem = document.createElement('div');
            createItem.className = 'tag-selector-item create';
            createItem.innerHTML = `<span>+ Create "${searchValue}"</span>`;
            createItem.onclick = () => {
                this.createAndAddTag(taskId, searchValue);
                input.value = '';
                this.handleTagSearch(input, taskId);
            };
            listElement.appendChild(createItem);
        }
    }
    
    createTagFromInput(input, taskId) {
        const value = input.value.trim().toLowerCase();
        if (!value) return;
        
        this.createAndAddTag(taskId, value);
        input.value = '';
        this.handleTagSearch(input, taskId);
    }
    
    createAndAddTag(taskId, tagName) {
        const normalizedTag = tagName.toLowerCase().trim();
        if (!normalizedTag) return;
        
        // Add to allTags if new (with random color)
        if (!this.allTags.find(t => t.name === normalizedTag)) {
            const randomColor = this.tagColors[Math.floor(Math.random() * this.tagColors.length)];
            this.allTags.push({
                name: normalizedTag,
                color: randomColor.value
            });
        }
        
        // Add to task
        this.toggleTaskTag(taskId, normalizedTag);
        this.saveToLocalStorage();
        this.renderFilterTabs();
    }
    
    getTagColor(tagName) {
        const tag = this.allTags.find(t => t.name === tagName);
        return tag ? tag.color : this.tagColors[0].value; // Default to purple
    }
    
    getTagByName(tagName) {
        return this.allTags.find(t => t.name === tagName);
    }
    
    toggleTaskTag(taskId, tagName) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;
        
        // Initialize tags if needed
        if (!task.tags) {
            task.tags = [];
        }
        
        // Toggle tag
        if (task.tags.includes(tagName)) {
            task.tags = task.tags.filter(tag => tag !== tagName);
        } else {
            task.tags.push(tagName);
        }
        
        // Update selector if open - refresh the list
        if (this.currentTagSelectorTaskId === taskId) {
            const selector = document.querySelector(`[data-task-id="${taskId}"] .tag-selector-container`);
            if (selector) {
                const input = selector.querySelector('.tag-selector-input');
                const searchValue = input ? input.value : '';
                this.handleTagSearch(input || { value: '' }, taskId);
                if (input) {
                    input.value = searchValue;
                }
            }
        }
        
        this.saveToLocalStorage();
        this.renderTasks();
    }
    
    removeTagFromTask(taskId, tagName) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;
        
        // Initialize tags array if it doesn't exist
        if (!task.tags) {
            task.tags = [];
        }
        
        task.tags = task.tags.filter(tag => tag !== tagName);
        
        // Check if tag is still used by other tasks
        const tagStillUsed = this.tasks.some(t => t.tags && t.tags.length > 0 && t.tags.includes(tagName));
        if (!tagStillUsed) {
            this.allTags = this.allTags.filter(tag => tag.name !== tagName);
        }
        
        // Reset filter to 'all' if removed tag was selected
        if (this.selectedTagFilter === tagName) {
            this.selectedTagFilter = 'all';
        }
        
        this.saveToLocalStorage();
        this.renderTasks();
        this.renderFilterTabs();
    }
    
    // Helper function to convert hex to rgba with transparency
    hexToRgba(hex, alpha = 0.15) {
        const num = parseInt(hex.replace('#', ''), 16);
        const r = (num >> 16) & 255;
        const g = (num >> 8) & 255;
        const b = num & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    
    renderTags(tags, taskId) {
        if (!tags || tags.length === 0) return '';
        
        return tags.map(tagName => {
            const tagColor = this.getTagColor(tagName);
            const transparentBg = this.hexToRgba(tagColor, 0.15);
            return `
                <span class="task-tag" style="background: ${transparentBg}; color: ${tagColor}">
                    ${tagName}
                    <button class="remove-tag-btn" onclick="taskTimer.removeTagFromTask(${taskId}, '${tagName}')" title="Remove tag">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    </button>
                </span>
            `;
        }).join('');
    }
    
    renderTagsReadOnly(tags) {
        if (!tags || tags.length === 0) return '';
        
        return tags.map(tagName => {
            const tagColor = this.getTagColor(tagName);
            const transparentBg = this.hexToRgba(tagColor, 0.15);
            return `
                <span class="task-tag-readonly" style="background: ${transparentBg}; color: ${tagColor}">
                    ${tagName}
                </span>
            `;
        }).join('');
    }
    
    triggerConfetti(taskElement) {
        // Find the checkbox within the task element
        const checkbox = taskElement.querySelector('.task-checkbox');
        if (!checkbox) return;
        
        // Get checkbox position relative to viewport
        const checkboxRect = checkbox.getBoundingClientRect();
        const checkboxCenterX = checkboxRect.left + checkboxRect.width / 2;
        const checkboxCenterY = checkboxRect.top + checkboxRect.height / 2;
        
        // Create canvas for confetti - positioned fixed to cover viewport
        const canvas = document.createElement('canvas');
        canvas.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            pointer-events: none;
            z-index: 9999;
        `;
        document.body.appendChild(canvas);
        
        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        
        // Confetti particles
        const particles = [];
        const colors = ['#8B5CF6', '#3B82F6', '#22C55E', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#F97316'];
        const particleCount = 50;
        
        // Create particles starting from checkbox center (viewport coordinates)
        for (let i = 0; i < particleCount; i++) {
            const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.5;
            const speed = Math.random() * 3 + 2;
            particles.push({
                x: checkboxCenterX,
                y: checkboxCenterY,
                size: Math.random() * 6 + 3,
                speedX: Math.cos(angle) * speed,
                speedY: Math.sin(angle) * speed,
                color: colors[Math.floor(Math.random() * colors.length)],
                rotation: Math.random() * 360,
                rotationSpeed: (Math.random() - 0.5) * 10,
                shape: Math.random() > 0.5 ? 'circle' : 'square'
            });
        }
        
        // Animation loop
        let animationId;
        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            let activeParticles = 0;
            
            particles.forEach(particle => {
                // Update position
                particle.x += particle.speedX;
                particle.y += particle.speedY;
                particle.rotation += particle.rotationSpeed;
                
                // Apply gravity
                particle.speedY += 0.15;
                
                // Draw particle (no boundary constraints - let them fall freely)
                ctx.save();
                ctx.translate(particle.x, particle.y);
                ctx.rotate((particle.rotation * Math.PI) / 180);
                ctx.fillStyle = particle.color;
                
                if (particle.shape === 'circle') {
                    ctx.beginPath();
                    ctx.arc(0, 0, particle.size / 2, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
                }
                
                ctx.restore();
                
                // Check if particle is still on screen
                if (particle.y < canvas.height + 100 && particle.x > -100 && particle.x < canvas.width + 100) {
                    activeParticles++;
                }
            });
            
            if (activeParticles > 0) {
                animationId = requestAnimationFrame(animate);
            } else {
                // Clean up
                if (canvas.parentNode) {
                    canvas.parentNode.removeChild(canvas);
                }
            }
        };
        
        animate();
    }
    
    // Tag Filter Methods
    renderFilterTabs() {
        if (!this.tagFilterTabs) return;
        
        // Only show tabs if there are tags
        if (this.allTags.length === 0) {
            this.tagFilterTabs.style.display = 'none';
            return;
        }
        
        this.tagFilterTabs.style.display = 'flex';
        this.tagFilterTabs.innerHTML = '';
        
        // Create "All" tab
        const allTab = document.createElement('button');
        allTab.className = `filter-tab ${this.selectedTagFilter === 'all' ? 'active' : ''}`;
        allTab.dataset.filter = 'all';
        
        const allCount = this.tasks.length;
        allTab.innerHTML = `
            <span class="filter-tab-label">All</span>
            <span class="filter-tab-badge">${allCount}</span>
        `;
        allTab.onclick = () => this.setTagFilter('all');
        this.tagFilterTabs.appendChild(allTab);
        
        // Create tabs for each tag
        this.allTags.forEach(tag => {
            const tab = document.createElement('button');
            tab.className = `filter-tab ${this.selectedTagFilter === tag.name ? 'active' : ''}`;
            tab.dataset.filter = tag.name;
            
            // Count tasks with this tag
            const tagCount = this.tasks.filter(task => 
                task.tags && task.tags.includes(tag.name)
            ).length;
            
            tab.innerHTML = `
                <span class="filter-tab-label">${tag.name}</span>
                <span class="filter-tab-badge" style="background: ${tag.color}20; color: ${tag.color}">${tagCount}</span>
            `;
            tab.onclick = () => this.setTagFilter(tag.name);
            this.tagFilterTabs.appendChild(tab);
        });
    }
    
    renderKanbanFilterTabs() {
        if (!this.kanbanFilterTabs) return;
        
        // Only show tabs if there are tags
        if (this.allTags.length === 0) {
            this.kanbanFilterTabs.style.display = 'none';
            return;
        }
        
        this.kanbanFilterTabs.style.display = 'flex';
        this.kanbanFilterTabs.innerHTML = '';
        
        // Create "All" tab
        const allTab = document.createElement('button');
        allTab.className = `filter-tab ${this.selectedTagFilter === 'all' ? 'active' : ''}`;
        allTab.dataset.filter = 'all';
        
        const allCount = this.tasks.filter(task => 
            task.state === this.TASK_STATES.TODAY || 
            task.state === this.TASK_STATES.IN_PROGRESS || 
            task.state === this.TASK_STATES.COMPLETE
        ).length;
        allTab.innerHTML = `
            <span class="filter-tab-label">All</span>
            <span class="filter-tab-badge">${allCount}</span>
        `;
        allTab.onclick = () => this.setTagFilter('all');
        this.kanbanFilterTabs.appendChild(allTab);
        
        // Create tabs for each tag
        this.allTags.forEach(tag => {
            const tab = document.createElement('button');
            tab.className = `filter-tab ${this.selectedTagFilter === tag.name ? 'active' : ''}`;
            tab.dataset.filter = tag.name;
            
            // Count tasks with this tag on the board
            const tagCount = this.tasks.filter(task => 
                (task.state === this.TASK_STATES.TODAY || 
                 task.state === this.TASK_STATES.IN_PROGRESS || 
                 task.state === this.TASK_STATES.COMPLETE) &&
                task.tags && task.tags.includes(tag.name)
            ).length;
            
            tab.innerHTML = `
                <span class="filter-tab-label">${tag.name}</span>
                <span class="filter-tab-badge" style="background: ${tag.color}20; color: ${tag.color}">${tagCount}</span>
            `;
            tab.onclick = () => this.setTagFilter(tag.name);
            this.kanbanFilterTabs.appendChild(tab);
        });
    }
    
    setTagFilter(tagName) {
        this.selectedTagFilter = tagName;
        this.renderFilterTabs();
        this.renderKanbanFilterTabs();
        this.renderTasks();
    }
}

// Initialize the timer when the page loads
let taskTimer;
document.addEventListener('DOMContentLoaded', () => {
    taskTimer = new TaskTimer();
});