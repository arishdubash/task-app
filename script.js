class TaskTimer {
    constructor() {
        this.tasks = [];
        this.history = []; // Array to store history log entries
        this.currentRunningTask = null;
        this.isRestMode = false;
        this.restTime = 5 * 60; // 5 minutes in seconds
        this.interval = null;
        this.pendingUndoAction = null;
        this.snackbarTimeoutId = null;
        this.snackbarProgressInterval = null;
        this.undoHistory = []; // Stores last 5 actions for undo/redo
        this.redoHistory = []; // Stores actions for redo
        this.maxHistorySize = 5;
        // Default tags that cannot be deleted
        this.defaultTags = ['Personal', 'Chores', 'Work'];
        this.allTags = [
            { name: 'Personal', color: '#8B5CF6', isDefault: true },
            { name: 'Chores', color: '#3B82F6', isDefault: true },
            { name: 'Work', color: '#22C55E', isDefault: true }
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
        this.loadGroupNames();
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
            
            // Save recent emojis (keep only 40 most recent)
            const recentEmojisToSave = this.recentEmojis.slice(0, 40);
            localStorage.setItem('pomodoro_recent_emojis', JSON.stringify(recentEmojisToSave));
            
            // Save history
            if (this.history && Array.isArray(this.history)) {
                const historyToSave = this.history.map(entry => ({
                    ...entry,
                    timestamp: entry.timestamp instanceof Date ? entry.timestamp.toISOString() : entry.timestamp
                }));
                localStorage.setItem('pomodoro_history', JSON.stringify(historyToSave));
            } else {
                localStorage.setItem('pomodoro_history', JSON.stringify([]));
            }
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
                    // Backward compatibility: assign default emoji if missing
                    if (!taskCopy.emoji && taskCopy.name) {
                        taskCopy.emoji = this.getEmojiForTaskName(taskCopy.name);
                    }
                    // Initialize orderIndex if missing (for backward compatibility)
                    if (taskCopy.orderIndex === undefined) {
                        taskCopy.orderIndex = 9999;
                    }
                    return taskCopy;
                });
                
                // Initialize orderIndex for tasks that don't have it, based on their current position
                this.tasks.forEach((task, index) => {
                    if (task.orderIndex === 9999) {
                        const group = task.group || 'thisWeek';
                        const tasksInGroup = this.tasks.filter(t => (t.group || 'thisWeek') === group);
                        const groupIndex = tasksInGroup.indexOf(task);
                        task.orderIndex = groupIndex;
                    }
                });
            }
            
            // Load tags - merge with default tags, preserving default tag colors if changed
            const savedTags = localStorage.getItem('pomodoro_tags');
            if (savedTags) {
                const tagsData = JSON.parse(savedTags);
                // Update default tags with saved colors if they were changed (case-insensitive)
                tagsData.forEach(savedTag => {
                    const defaultTagIndex = this.allTags.findIndex(t => 
                        t.name.toLowerCase() === savedTag.name.toLowerCase() && 
                        this.defaultTags.some(dt => dt.toLowerCase() === savedTag.name.toLowerCase())
                    );
                    if (defaultTagIndex !== -1) {
                        // Update color of default tag if it was changed
                        this.allTags[defaultTagIndex].color = savedTag.color;
                    }
                });
                // Add user-created tags (not in default list)
                // Filter out default tags (case-insensitive)
                const defaultTagNamesLower = new Set(this.defaultTags.map(dt => dt.toLowerCase()));
                const userTags = tagsData.filter(tag => !defaultTagNamesLower.has(tag.name.toLowerCase()));
                this.allTags = [...this.allTags, ...userTags];
            }
            
            // Load selected filter
            const savedFilter = localStorage.getItem('pomodoro_selected_filter');
            if (savedFilter) {
                this.selectedTagFilter = savedFilter;
            }
            
            // Load recent emojis
            const savedRecentEmojis = localStorage.getItem('pomodoro_recent_emojis');
            if (savedRecentEmojis) {
                try {
                    this.recentEmojis = JSON.parse(savedRecentEmojis);
                } catch (e) {
                    this.recentEmojis = [];
                }
            }
            
            // Load history
            const savedHistory = localStorage.getItem('pomodoro_history');
            if (savedHistory) {
                try {
                    const historyData = JSON.parse(savedHistory);
                    this.history = historyData.map(entry => ({
                        ...entry,
                        timestamp: new Date(entry.timestamp)
                    }));
                } catch (e) {
                    this.history = [];
                }
            } else {
                this.history = [];
            }
            
            // Load sidebar state
            const sidebarExpanded = localStorage.getItem('sidebar_expanded');
            if (sidebarExpanded === 'true' && this.sidebar) {
                this.sidebar.classList.add('expanded');
            }
            // Update icon based on loaded state
            this.updateSidebarIcon();
        } catch (error) {
            console.error('Error loading from localStorage:', error);
        }
    }
    
    // History Methods
    addHistoryEntry(taskId, taskName, action) {
        const entry = {
            id: Date.now(),
            taskId: taskId,
            taskName: taskName,
            action: action,
            timestamp: new Date()
        };
        this.history.push(entry);
        this.saveToLocalStorage();
        // Only render history if we're currently viewing it
        if (this.historyView && this.historyView.style.display !== 'none') {
            this.renderHistory();
        }
    }
    
    deleteHistoryEntry(entryId) {
        // Store the entryId to delete after confirmation
        this.pendingDeleteHistoryId = entryId;
        
        // Show confirmation modal
        if (this.deleteHistoryModal) {
            this.deleteHistoryModal.classList.add('show');
        }
    }
    
    confirmDeleteHistoryEntry() {
        if (this.pendingDeleteHistoryId !== undefined) {
            this.history = this.history.filter(entry => entry.id !== this.pendingDeleteHistoryId);
            this.saveToLocalStorage();
            this.renderHistory();
            this.pendingDeleteHistoryId = undefined;
        }
        this.hideDeleteHistoryModal();
    }
    
    hideDeleteHistoryModal() {
        if (this.deleteHistoryModal) {
            this.deleteHistoryModal.classList.remove('show');
        }
        this.pendingDeleteHistoryId = undefined;
    }
    
    renderHistory() {
        if (!this.historyTasksBody) return;
        
        // Clear table body
        this.historyTasksBody.innerHTML = '';
        
        // Get only completed tasks (those with completedAt set)
        const completedTasks = this.tasks.filter(task => task.completedAt);
        
        if (completedTasks.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="3" style="text-align: center; padding: 40px; color: var(--text-tertiary);">No completed tasks yet.</td>`;
            this.historyTasksBody.appendChild(row);
            return;
        }
        
        // Filter out duplicates - keep only the most recent completion per task
        const taskMap = new Map();
        completedTasks.forEach(task => {
            const existing = taskMap.get(task.id);
            if (!existing || task.completedAt > existing.completedAt) {
                taskMap.set(task.id, task);
            }
        });
        const uniqueCompletedTasks = Array.from(taskMap.values());
        
        // Apply tag filter if one is selected
        let filteredTasks = uniqueCompletedTasks;
        if (this.selectedTagFilter && this.selectedTagFilter !== 'all') {
            filteredTasks = uniqueCompletedTasks.filter(task => 
                task.tags && task.tags.some(tagName => 
                    tagName.toLowerCase() === this.selectedTagFilter.toLowerCase()
                )
            );
        }
        
        if (filteredTasks.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="3" style="text-align: center; padding: 40px; color: var(--text-tertiary);">No completed tasks found.</td>`;
            this.historyTasksBody.appendChild(row);
            return;
        }
        
        // Sort by completion date (most recent first)
        filteredTasks.sort((a, b) => b.completedAt - a.completedAt);
        
        // Group tasks by day
        const tasksByDay = new Map();
        filteredTasks.forEach(task => {
            const completionDate = new Date(task.completedAt);
            // Use YYYY-MM-DD for sorting key
            const year = completionDate.getFullYear();
            const month = String(completionDate.getMonth() + 1).padStart(2, '0');
            const day = String(completionDate.getDate()).padStart(2, '0');
            const sortKey = `${year}-${month}-${day}`;
            
            // Format for display
            const displayKey = completionDate.toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            });
            
            if (!tasksByDay.has(sortKey)) {
                tasksByDay.set(sortKey, { displayKey, tasks: [] });
            }
            tasksByDay.get(sortKey).tasks.push(task);
        });
        
        // Render tasks grouped by day - sort by date key (most recent first)
        const sortedDays = Array.from(tasksByDay.entries()).sort((a, b) => {
            return b[0].localeCompare(a[0]); // Most recent first (YYYY-MM-DD format)
        });
        
        sortedDays.forEach(([sortKey, dayData]) => {
            const dayTasks = dayData.tasks;
            const displayKey = dayData.displayKey;
            
            // Day header row
            const dayHeaderRow = document.createElement('tr');
            dayHeaderRow.className = 'history-day-header';
            const dayHeaderCell = document.createElement('td');
            dayHeaderCell.colSpan = 3;
            dayHeaderCell.style.cssText = 'padding: 16px 20px 8px 20px; font-weight: 600; color: var(--text-secondary); font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;';
            dayHeaderCell.textContent = displayKey;
            dayHeaderRow.appendChild(dayHeaderCell);
            this.historyTasksBody.appendChild(dayHeaderRow);
            
            // Task rows for this day
            dayTasks.forEach(task => {
                const row = document.createElement('tr');
                row.className = 'task-row';
                
                // Time cell - show the time when completed (day header already shows the date)
                const timeCell = document.createElement('td');
                timeCell.className = 'status-col';
                timeCell.style.paddingLeft = '20px';
                
                const completionDate = new Date(task.completedAt);
                const timeStr = completionDate.toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    hour12: true 
                });
                
                const timeSpan = document.createElement('span');
                timeSpan.style.color = 'var(--text-secondary)';
                timeSpan.textContent = timeStr;
                timeCell.appendChild(timeSpan);
                
                // Task name and tags cell
                const taskCell = document.createElement('td');
                taskCell.className = 'description-col';
                
                // Task name
                const nameContainer = document.createElement('div');
                nameContainer.style.cssText = 'display: flex; align-items: center; gap: 8px; flex-wrap: wrap;';
                
                const nameSpan = document.createElement('span');
                nameSpan.style.color = 'var(--text-primary)';
                nameSpan.textContent = task.name;
                nameContainer.appendChild(nameSpan);
                
                // Tags
                if (task.tags && task.tags.length > 0) {
                    const tagsContainer = document.createElement('div');
                    tagsContainer.className = 'table-tags';
                    tagsContainer.style.cssText = 'display: inline-flex; gap: 6px; flex-wrap: wrap;';
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
                    nameContainer.appendChild(tagsContainer);
                }
                
                taskCell.appendChild(nameContainer);
                
                // Empty cell for spacing
                const emptyCell = document.createElement('td');
                emptyCell.className = 'empty';
                
                // Append cells to row
                row.appendChild(timeCell);
                row.appendChild(taskCell);
                row.appendChild(emptyCell);
            
            // Append row to table body
            this.historyTasksBody.appendChild(row);
            });
        });
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
        this.completedTasksBody = document.getElementById('completed-tasks-body');
        
        // Group selector elements
        this.groupThisWeekRadio = document.getElementById('group-this-week');
        this.groupLaterRadio = document.getElementById('group-later');
        
        // Modal elements
        this.addTaskModal = document.getElementById('add-task-modal');
        this.taskNameInput = document.getElementById('task-name-input');
        this.taskDescriptionInput = document.getElementById('task-description-input');
        this.taskTagsSelector = document.getElementById('task-tags-selector');
        this.statusNoneRadio = document.getElementById('status-none');
        this.statusTodayRadio = document.getElementById('status-today');
        this.statusInProgressRadio = document.getElementById('status-in-progress');
        this.statusCompleteRadio = document.getElementById('status-complete');
        this.closeTaskModalBtn = document.getElementById('close-task-modal');
        this.cancelTaskBtn = document.getElementById('cancel-task-btn');
        this.saveTaskBtn = document.getElementById('save-task-btn');
        
        // Doodle canvas elements
        this.doodleModal = document.getElementById('doodle-modal');
        this.doodleCanvas = document.getElementById('doodle-canvas');
        this.doodleTimerDisplay = document.getElementById('doodle-timer-display');
        this.clearCanvasBtn = document.getElementById('clear-canvas');
        this.closeDoodleBtn = document.getElementById('close-doodle');
        
        // Delete history modal elements
        this.deleteHistoryModal = document.getElementById('delete-history-modal');
        this.closeDeleteHistoryModalBtn = document.getElementById('close-delete-history-modal');
        this.cancelDeleteHistoryBtn = document.getElementById('cancel-delete-history-btn');
        this.confirmDeleteHistoryBtn = document.getElementById('confirm-delete-history-btn');
        this.pendingDeleteHistoryId = undefined;
        
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
        this.historyView = document.getElementById('history-view');
        this.historyTasksBody = document.getElementById('history-tasks-body');
        this.addTagBtn = document.getElementById('add-tag-btn');
        this.addTagModal = document.getElementById('add-tag-modal');
        this.tagNameInput = document.getElementById('tag-name-input');
        this.tagsTableBody = document.getElementById('tags-table-body');
        this.modalColorOptions = document.getElementById('modal-color-options');
        this.closeTagModalBtn = document.getElementById('close-tag-modal');
        this.cancelTagBtn = document.getElementById('cancel-tag-btn');
        this.saveTagBtn = document.getElementById('save-tag-btn');
        this.editTagModal = document.getElementById('edit-tag-modal');
        this.editTagNameInput = document.getElementById('edit-tag-name-input');
        this.closeEditTagModalBtn = document.getElementById('close-edit-tag-modal');
        this.cancelEditTagBtn = document.getElementById('cancel-edit-tag-btn');
        this.saveEditTagBtn = document.getElementById('save-edit-tag-btn');
        this.currentEditingTagName = null;
        this.selectedColor = this.tagColors[0].value;
        
        // Tag filter state
        this.selectedTagFilter = 'all';
        this.tagFilterTabsContainer = document.getElementById('tag-filter-tabs-container');
        this.tagFilterTabs = document.getElementById('tag-filter-tabs');
        this.kanbanFilterTabs = document.getElementById('kanban-filter-tabs');
        this.historyFilterTabsContainer = document.getElementById('history-filter-tabs-container');
        this.historyFilterTabs = document.getElementById('history-filter-tabs');
        
        // Emoji selector elements
        this.emojiPickerBtn = document.getElementById('emoji-picker-btn');
        this.selectedEmojiDisplay = document.getElementById('selected-emoji-display');
        this.emojiPickerDropdown = document.getElementById('emoji-picker-dropdown');
        this.emojiSearchInput = document.getElementById('emoji-search-input');
        this.emojiCategoryTabs = document.getElementById('emoji-category-tabs');
        this.emojiGridContainer = document.getElementById('emoji-grid-container');
        
        // Sidebar elements
        this.sidebar = document.getElementById('sidebar');
        this.sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
        this.sidebarToggleIcon = document.getElementById('sidebar-toggle-icon');
        
        // Track if emoji was manually selected (to prevent auto-updates)
        this.emojiManuallySelected = false;
        this.emojiSearchInput = document.getElementById('emoji-search-input');
        
        // Comprehensive emoji database organized by category
        this.emojiCategories = {
            'Smileys & People': ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '😶‍🌫️', '😵', '😵‍💫', '🤯', '🤠', '🥳', '😎', '🤓', '🧐', '😕', '😟', '🙁', '☹️', '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾'],
            'Gestures & Body Parts': ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁️', '👅', '👄'],
            'People & Family': ['👶', '🧒', '👦', '👧', '🧑', '👱', '👨', '🧔', '👨‍🦰', '👨‍🦱', '👨‍🦳', '👨‍🦲', '👩', '👩‍🦰', '🧑‍🦰', '👩‍🦱', '🧑‍🦱', '👩‍🦳', '🧑‍🦳', '👩‍🦲', '🧑‍🦲', '👱‍♀️', '👱‍♂️', '🧓', '👴', '👵', '🙍', '🙍‍♂️', '🙍‍♀️', '🙎', '🙎‍♂️', '🙎‍♀️', '🙅', '🙅‍♂️', '🙅‍♀️', '🙆', '🙆‍♂️', '🙆‍♀️', '💁', '💁‍♂️', '💁‍♀️', '🙋', '🙋‍♂️', '🙋‍♀️', '🧏', '🧏‍♂️', '🧏‍♀️', '🤦', '🤦‍♂️', '🤦‍♀️', '🤷', '🤷‍♂️', '🤷‍♀️', '🧑‍⚕️', '👨‍⚕️', '👩‍⚕️', '🧑‍🎓', '👨‍🎓', '👩‍🎓', '🧑‍🏫', '👨‍🏫', '👩‍🏫', '🧑‍⚖️', '👨‍⚖️', '👩‍⚖️', '🧑‍🌾', '👨‍🌾', '👩‍🌾', '🧑‍🍳', '👨‍🍳', '👩‍🍳', '🧑‍🔧', '👨‍🔧', '👩‍🔧', '🧑‍🏭', '👨‍🏭', '👩‍🏭', '🧑‍💼', '👨‍💼', '👩‍💼', '🧑‍🔬', '👨‍🔬', '👩‍🔬', '🧑‍💻', '👨‍💻', '👩‍💻', '🧑‍🎤', '👨‍🎤', '👩‍🎤', '🧑‍🎨', '👨‍🎨', '👩‍🎨', '🧑‍✈️', '👨‍✈️', '👩‍✈️', '🧑‍🚀', '👨‍🚀', '👩‍🚀', '🧑‍🚒', '👨‍🚒', '👩‍🚒', '👮', '👮‍♂️', '👮‍♀️', '🕵️', '🕵️‍♂️', '🕵️‍♀️', '💂', '💂‍♂️', '💂‍♀️', '🥷', '👷', '👷‍♂️', '👷‍♀️', '🤴', '👸', '👳', '👳‍♂️', '👳‍♀️', '👲', '🧕', '🤵', '🤵‍♂️', '🤵‍♀️', '👰', '👰‍♂️', '👰‍♀️', '🤰', '🤱', '👼', '🎅', '🤶', '🦸', '🦸‍♂️', '🦸‍♀️', '🦹', '🦹‍♂️', '🦹‍♀️', '🧙', '🧙‍♂️', '🧙‍♀️', '🧚', '🧚‍♂️', '🧚‍♀️', '🧛', '🧛‍♂️', '🧛‍♀️', '🧜', '🧜‍♂️', '🧜‍♀️', '🧝', '🧝‍♂️', '🧝‍♀️', '🧞', '🧞‍♂️', '🧞‍♀️', '🧟', '🧟‍♂️', '🧟‍♀️', '💆', '💆‍♂️', '💆‍♀️', '💇', '💇‍♂️', '💇‍♀️', '🚶', '🚶‍♂️', '🚶‍♀️', '🧍', '🧍‍♂️', '🧍‍♀️', '🧎', '🧎‍♂️', '🧎‍♀️', '🏃', '🏃‍♂️', '🏃‍♀️', '💃', '🕺', '🕴️', '👯', '👯‍♂️', '👯‍♀️', '🧘', '🧘‍♂️', '🧘‍♀️', '🛀', '🛌', '👭', '👫', '👬', '💏', '💑', '👪', '👨‍👩‍👧', '👨‍👩‍👧‍👦', '👨‍👩‍👦‍👦', '👨‍👩‍👧‍👧', '👩‍👩‍👦', '👩‍👩‍👧', '👩‍👩‍👧‍👦', '👩‍👩‍👦‍👦', '👩‍👩‍👧‍👧', '👨‍👨‍👦', '👨‍👨‍👧', '👨‍👨‍👧‍👦', '👨‍👨‍👦‍👦', '👨‍👨‍👧‍👧', '👩‍👦', '👩‍👧', '👩‍👧‍👦', '👩‍👦‍👦', '👩‍👧‍👧', '👨‍👦', '👨‍👧', '👨‍👧‍👦', '👨‍👦‍👦', '👨‍👧‍👧'],
            'Animals & Nature': ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐽', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒', '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🪲', '🪳', '🦟', '🦗', '🕷️', '🦂', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🦣', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🦬', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩', '🦮', '🐕‍🦺', '🐈', '🐈‍⬛', '🪶', '🐓', '🦃', '🦤', '🦚', '🦜', '🦢', '🦩', '🕊️', '🐇', '🦝', '🦨', '🦡', '🦫', '🦦', '🦥', '🐁', '🐀', '🐿️', '🦔', '🌲', '🌳', '🌴', '🌵', '🌶️', '🌾', '🌿', '☘️', '🍀', '🍁', '🍂', '🍃', '🍄', '🐚', '🪨', '🌾', '💐', '🌷', '🌹', '🥀', '🌺', '🌻', '🌼', '🌏', '🌎', '🌍', '🌕', '🌖', '🌗', '🌘', '🌑', '🌒', '🌓', '🌔', '🌙', '🌚', '🌛', '🌜', '🌝', '🌞', '⭐', '🌟', '💫', '✨', '☄️', '💥', '🔥', '☀️', '🌤️', '⛅', '🌥️', '☁️', '🌦️', '🌧️', '⛈️', '🌩️', '⚡', '☔', '⛄', '❄️', '🌊', '💧', '💦', '☔'],
            'Food & Drink': ['🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶️', '🌽', '🥕', '🫒', '🥔', '🍠', '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🥞', '🥓', '🥩', '🍗', '🍖', '🦴', '🌭', '🍔', '🍟', '🍕', '🫓', '🥪', '🥙', '🧆', '🌮', '🌯', '🫔', '🥗', '🥘', '🫕', '🥫', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🦪', '🍤', '🍙', '🍚', '🍘', '🍥', '🥠', '🥮', '🍢', '🍡', '🍧', '🍨', '🍦', '🥧', '🧁', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫', '🍿', '🍩', '🍪', '🌰', '🥜', '🍯', '🥛', '🍼', '🫖', '☕️', '🍵', '🧃', '🥤', '🧋', '🍶', '🍺', '🍻', '🥂', '🍷', '🥃', '🍸', '🍹', '🧉', '🍾', '🧊'],
            'Travel & Places': ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🦯', '🦽', '🦼', '🛴', '🚲', '🛵', '🏍️', '🛺', '🚨', '🚔', '🚍', '🚘', '🚖', '🚡', '🚠', '🚟', '🚃', '🚋', '🚞', '🚝', '🚄', '🚅', '🚈', '🚂', '🚆', '🚇', '🚊', '🚉', '✈️', '🛫', '🛬', '🛩️', '💺', '🚁', '🚟', '🛸', '🚀', '🛎️', '🧳', '⌛', '⏳', '⌚', '⏰', '⏱️', '⏲️', '🕰️', '🕛', '🕧', '🕐', '🕜', '🕑', '🕝', '🕒', '🕞', '🕓', '🕟', '🕔', '🕠', '🕕', '🕡', '🕖', '🕢', '🕗', '🕣', '🕘', '🕤', '🕙', '🕥', '🕚', '🕦', '🌍', '🌎', '🌏', '🌐', '🗺️', '🧭', '🏔️', '⛰️', '🌋', '🗻', '🏕️', '🏖️', '🏜️', '🏝️', '🏞️', '🏟️', '🏛️', '🏗️', '🧱', '🏘️', '🏚️', '🏠', '🏡', '🏢', '🏣', '🏤', '🏥', '🏦', '🏨', '🏩', '🏪', '🏫', '🏬', '🏭', '🏯', '🏰', '💒', '🗼', '🗽', '⛪', '🕌', '🛕', '🕍', '⛩️', '🕋', '⛲', '⛺', '🌁', '🌃', '🏙️', '🌄', '🌅', '🌆', '🌇', '🌉', '♨️', '🎠', '🎡', '🎢', '💈', '🎪', '🚂', '🚃', '🚄', '🚅', '🚆', '🚇', '🚈', '🚉', '🚊', '🚝', '🚞', '🚋', '🚌', '🚍', '🚎', '🚐', '🚑', '🚒', '🚓', '🚔', '🚕', '🚖', '🚗', '🚘', '🚙', '🚚', '🚛', '🚜', '🚲', '🛴', '🛵', '🏍️', '🛺', '🚨', '🚥', '🚦', '🚧', '⛽', '🛣️', '🛤️', '🛢️', '⛽', '🚏', '🗺️', '🗿', '🛕'],
            'Activities': ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🥅', '⛳', '🏹', '🎣', '🥊', '🥋', '🎽', '🛹', '🛷', '⛸️', '🥌', '🎿', '⛷️', '🏂', '🪂', '🏋️', '🤼', '🤸', '🤺', '⛹️', '🤾', '🏌️', '🏇', '🧘', '🏄', '🏊', '🚣', '🧗', '🚵', '🚴', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🏵️', '🎗️', '🎫', '🎟️', '🎪', '🤹', '🎭', '🩰', '🎨', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🎷', '🎺', '🎸', '🪕', '🎻', '🎲', '♟️', '🎯', '🎳', '🎮', '🎰', '🧩'],
            'Objects': ['⌚', '📱', '📲', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '🖲️', '🕹️', '🗜️', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥', '📽️', '🎞️', '📞', '☎️', '📟', '📠', '📺', '📻', '🎙️', '🎚️', '🎛️', '⏱️', '⏲️', '⏰', '🕰️', '⌛', '⏳', '📡', '🔋', '🔌', '💡', '🔦', '🕯️', '🪔', '🧯', '🛢️', '💸', '💵', '💴', '💶', '💷', '💰', '💳', '💎', '⚖️', '🪜', '🧰', '🪛', '🔧', '🔨', '⚒️', '🛠️', '⛏️', '🪚', '🔩', '⚙️', '🪤', '🧱', '⛓️', '🧲', '🔫', '💣', '🧨', '🪓', '🔪', '🗡️', '⚔️', '🛡️', '🚬', '⚰️', '🪦', '⚱️', '🏺', '🔮', '📿', '🧿', '💈', '⚗️', '🔭', '🔬', '🕳️', '🩹', '🩺', '💊', '💉', '🩸', '🧬', '🦠', '🧫', '🧪', '🌡️', '🧹', '🪠', '🧺', '🧻', '🚽', '🚿', '🛁', '🛀', '🧼', '🪥', '🪒', '🧴', '🧷', '🧹', '🧺', '🧻', '🛒', '🚬', '⚰️', '🪦', '⚱️', '🗿', '🛎️', '🧳', '🚪', '🛋️', '🛏️', '🛌', '🧸', '🪆', '🖼️', '🪞', '🪟', '🛍️', '🛒', '🎁', '🎈', '🎏', '🎀', '🪄', '🪅', '🎊', '🎉', '🎎', '🏮', '🎐', '🧧', '✉️', '📩', '📨', '📧', '💌', '📥', '📤', '📦', '🏷️', '📪', '📫', '📬', '📭', '📮', '📯', '📜', '📃', '📄', '📑', '🧾', '📊', '📈', '📉', '🗒️', '🗓️', '📆', '📅', '🗑️', '📇', '🗃️', '🗳️', '🗄️', '📋', '📁', '📂', '🗂️', '📌', '📍', '📎', '🖇️', '📏', '📐', '✂️', '🗃️', '🗄️', '🗑️', '🔒', '🔓', '🔏', '🔐', '🔑', '🗝️', '🔨', '🪓', '⛏️', '🪚', '🔧', '🪛', '🧰', '🪜', '⚙️', '🗜️', '⚖️', '🦯', '🔗', '⛓️', '🧰', '🧲', '🪝', '🧪', '🧫', '🧬', '🦠', '🔬', '🔭', '📡', '💉', '🩸', '💊', '🩹', '🩺', '🧴', '🪒', '🧷', '🪡', '🧵', '🧶', '🪢'],
            'Symbols': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '🆔', '⚛️', '🉑', '☢️', '☣️', '📴', '📳', '🈶', '🈚', '🈸', '🈺', '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️', '㊗️', '🈴', '🈵', '🈹', '🈲', '🅰️', '🅱️', '🆎', '🆑', '🅾️', '🆘', '❌', '⭕', '🛑', '⛔', '📛', '🚫', '💯', '💢', '♨️', '🚷', '🚯', '🚳', '🚱', '🔞', '📵', '🚭', '❗', '❓', '❕', '❔', '‼️', '⁉️', '🔅', '🔆', '〽️', '⚠️', '🚸', '🔱', '⚜️', '🔰', '♻️', '✅', '🈯', '💹', '❇️', '✳️', '❎', '🌐', '💠', 'Ⓜ️', '🌀', '💤', '🏧', '🚾', '♿', '🅿️', '🈳', '🈂️', '🛂', '🛃', '🛄', '🛅', '🚹', '🚺', '🚼', '🚻', '🚮', '🎦', '📶', '🈁', '🔣', '🔄', '🔤', 'ℹ️', '🔡', '🔢', '🔠', '#️⃣', '*️⃣', '0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '🔠', '🔡', '🔢', '🔣', '🔤', '🅰️', '🆎', '🅱️', '🆑', '🆒', '🆓', 'ℹ️', '🆔', 'Ⓜ️', '🆕', '🆖', '🅾️', '🆗', '🆘', '🆙', '🆚', '🈁', '🈂️', '🈷️', '🈶', '🈯', '🉐', '🈹', '🈲', '🉑', '🈸', '🈴', '🈳', '㊗️', '㊙️', '🈺', '🈵', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤', '🔶', '🔷', '🔸', '🔹', '🔺', '🔻', '💠', '🔘', '🔳', '🔲', '▪️', '▫️', '◾', '◽', '◼️', '◻️', '🟥', '🟧', '🟨', '🟩', '🟦', '🟪', '⬛', '⬜', '🟫', '🔈', '🔇', '🔉', '🔊', '🔔', '🔕', '📣', '📢', '💬', '💭', '🗯️', '♠️', '♣️', '♥️', '♦️', '🃏', '🎴', '🀄', '🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛', '🕜', '🕝', '🕞', '🕟', '🕠', '🕡', '🕢', '🕣', '🕤', '🕥', '🕦', '🕧'],
            'Flags': ['🏳️', '🏴', '🏁', '🚩', '🏳️‍🌈', '🏳️‍⚧️', '🇦🇨', '🇦🇩', '🇦🇪', '🇦🇫', '🇦🇬', '🇦🇮', '🇦🇱', '🇦🇲', '🇦🇴', '🇦🇶', '🇦🇷', '🇦🇸', '🇦🇹', '🇦🇺', '🇦🇼', '🇦🇽', '🇦🇿', '🇧🇦', '🇧🇧', '🇧🇩', '🇧🇪', '🇧🇫', '🇧🇬', '🇧🇭', '🇧🇮', '🇧🇯', '🇧🇱', '🇧🇲', '🇧🇳', '🇧🇴', '🇧🇶', '🇧🇷', '🇧🇸', '🇧🇹', '🇧🇻', '🇧🇼', '🇧🇾', '🇧🇿', '🇨🇦', '🇨🇨', '🇨🇩', '🇨🇫', '🇨🇬', '🇨🇭', '🇨🇮', '🇨🇰', '🇨🇱', '🇨🇲', '🇨🇳', '🇨🇴', '🇨🇵', '🇨🇷', '🇨🇺', '🇨🇻', '🇨🇼', '🇨🇽', '🇨🇾', '🇨🇿', '🇩🇪', '🇩🇬', '🇩🇯', '🇩🇰', '🇩🇲', '🇩🇴', '🇩🇿', '🇪🇦', '🇪🇨', '🇪🇪', '🇪🇬', '🇪🇭', '🇪🇷', '🇪🇸', '🇪🇹', '🇪🇺', '🇫🇮', '🇫🇯', '🇫🇰', '🇫🇲', '🇫🇴', '🇫🇷', '🇬🇦', '🇬🇧', '🇬🇩', '🇬🇪', '🇬🇫', '🇬🇬', '🇬🇭', '🇬🇮', '🇬🇱', '🇬🇲', '🇬🇳', '🇬🇵', '🇬🇶', '🇬🇷', '🇬🇸', '🇬🇹', '🇬🇺', '🇬🇼', '🇬🇾', '🇭🇰', '🇭🇲', '🇭🇳', '🇭🇷', '🇭🇹', '🇭🇺', '🇮🇨', '🇮🇩', '🇮🇪', '🇮🇱', '🇮🇲', '🇮🇳', '🇮🇴', '🇮🇶', '🇮🇷', '🇮🇸', '🇮🇹', '🇯🇪', '🇯🇲', '🇯🇴', '🇯🇵', '🇰🇪', '🇰🇬', '🇰🇭', '🇰🇮', '🇰🇲', '🇰🇳', '🇰🇵', '🇰🇷', '🇰🇼', '🇰🇾', '🇰🇿', '🇱🇦', '🇱🇧', '🇱🇨', '🇱🇮', '🇱🇰', '🇱🇷', '🇱🇸', '🇱🇹', '🇱🇺', '🇱🇻', '🇱🇾', '🇲🇦', '🇲🇨', '🇲🇩', '🇲🇪', '🇲🇫', '🇲🇬', '🇲🇭', '🇲🇰', '🇲🇱', '🇲🇲', '🇲🇳', '🇲🇴', '🇲🇵', '🇲🇶', '🇲🇷', '🇲🇸', '🇲🇹', '🇲🇺', '🇲🇻', '🇲🇼', '🇲🇽', '🇲🇾', '🇲🇿', '🇳🇦', '🇳🇨', '🇳🇪', '🇳🇫', '🇳🇬', '🇳🇮', '🇳🇱', '🇳🇴', '🇳🇵', '🇳🇷', '🇳🇺', '🇳🇿', '🇴🇲', '🇵🇦', '🇵🇪', '🇵🇫', '🇵🇬', '🇵🇭', '🇵🇰', '🇵🇱', '🇵🇲', '🇵🇳', '🇵🇷', '🇵🇸', '🇵🇹', '🇵🇼', '🇵🇾', '🇶🇦', '🇷🇪', '🇷🇴', '🇷🇸', '🇷🇺', '🇷🇼', '🇸🇦', '🇸🇧', '🇸🇨', '🇸🇩', '🇸🇪', '🇸🇬', '🇸🇭', '🇸🇮', '🇸🇯', '🇸🇰', '🇸🇱', '🇸🇲', '🇸🇳', '🇸🇴', '🇸🇷', '🇸🇸', '🇸🇹', '🇸🇻', '🇸🇽', '🇸🇾', '🇸🇿', '🇹🇦', '🇹🇨', '🇹🇩', '🇹🇫', '🇹🇬', '🇹🇭', '🇹🇯', '🇹🇰', '🇹🇱', '🇹🇲', '🇹🇳', '🇹🇴', '🇹🇷', '🇹🇹', '🇹🇻', '🇹🇼', '🇹🇿', '🇺🇦', '🇺🇬', '🇺🇲', '🇺🇳', '🇺🇸', '🇺🇾', '🇺🇿', '🇻🇦', '🇻🇨', '🇻🇪', '🇻🇬', '🇻🇮', '🇻🇳', '🇻🇺', '🇼🇫', '🇼🇸', '🇾🇪', '🇾🇹', '🇿🇦', '🇿🇲', '🇿🇼']
        };
        
        this.selectedEmojiCategory = 'Smileys & People';
        
        // Build emoji keyword map for search
        this.emojiKeywordMap = this.buildEmojiKeywordMap();
        
        // Track recently used emojis (when manually selected and saved to tasks)
        this.recentEmojis = []; // Array of { emoji: string, timestamp: number }
    }
    
    getEmojiName(emoji) {
        // Comprehensive emoji name mapping for tooltips - maps emoji to human-readable name
        const emojiNames = {
            // Animals
            '🐘': 'Elephant', '🐶': 'Dog', '🐱': 'Cat', '🐭': 'Mouse', '🐹': 'Hamster', '🐰': 'Rabbit',
            '🦊': 'Fox', '🐻': 'Bear', '🐼': 'Panda Bear', '🐨': 'Koala', '🐯': 'Tiger', '🦁': 'Lion',
            '🐮': 'Cow', '🐷': 'Pig', '🐽': 'Pig Nose', '🐸': 'Frog', '🐵': 'Monkey Face', '🙈': 'See-No-Evil Monkey',
            '🙉': 'Hear-No-Evil Monkey', '🙊': 'Speak-No-Evil Monkey', '🐒': 'Monkey', '🐔': 'Chicken', '🐧': 'Penguin',
            '🐦': 'Bird', '🐤': 'Baby Chick', '🐣': 'Hatching Chick', '🐥': 'Front-Facing Baby Chick', '🦆': 'Duck',
            '🦅': 'Eagle', '🦉': 'Owl', '🦇': 'Bat', '🐺': 'Wolf', '🐗': 'Boar', '🐴': 'Horse Face',
            '🦄': 'Unicorn', '🐝': 'Honeybee', '🐛': 'Bug', '🦋': 'Butterfly', '🐌': 'Snail', '🐞': 'Lady Beetle',
            '🐜': 'Ant', '🪲': 'Beetle', '🪳': 'Cockroach', '🦟': 'Mosquito', '🦗': 'Cricket', '🕷️': 'Spider',
            '🦂': 'Scorpion', '🐢': 'Turtle', '🐍': 'Snake', '🦎': 'Lizard', '🦖': 'T-Rex', '🦕': 'Sauropod',
            '🐙': 'Octopus', '🦑': 'Squid', '🦐': 'Shrimp', '🦞': 'Lobster', '🦀': 'Crab', '🐡': 'Blowfish',
            '🐠': 'Tropical Fish', '🐟': 'Fish', '🐬': 'Dolphin', '🐳': 'Spouting Whale', '🐋': 'Whale',
            '🦈': 'Shark', '🐊': 'Crocodile', '🐅': 'Tiger', '🐆': 'Leopard', '🦓': 'Zebra', '🦍': 'Gorilla',
            '🦧': 'Orangutan', '🦣': 'Mammoth', '🐘': 'Elephant', '🦛': 'Hippopotamus', '🦏': 'Rhinoceros',
            '🐪': 'Dromedary Camel', '🐫': 'Bactrian Camel', '🦒': 'Giraffe', '🦘': 'Kangaroo', '🦬': 'Bison',
            '🐃': 'Water Buffalo', '🐂': 'Ox', '🐄': 'Cow', '🐎': 'Horse', '🐖': 'Pig', '🐏': 'Ram',
            '🐑': 'Ewe', '🦙': 'Llama', '🐐': 'Goat', '🦌': 'Deer', '🐕': 'Dog', '🐩': 'Poodle',
            '🦮': 'Guide Dog', '🐕‍🦺': 'Service Dog', '🐈': 'Cat', '🐈‍⬛': 'Black Cat', '🪶': 'Feather',
            '🐓': 'Rooster', '🦃': 'Turkey', '🦤': 'Dodo', '🦚': 'Peacock', '🦜': 'Parrot', '🦢': 'Swan',
            '🦩': 'Flamingo', '🕊️': 'Dove', '🐇': 'Rabbit', '🦝': 'Raccoon', '🦨': 'Skunk', '🦡': 'Badger',
            '🦫': 'Beaver', '🦦': 'Otter', '🦥': 'Sloth', '🐁': 'Mouse', '🐀': 'Rat', '🐿️': 'Chipmunk',
            '🦔': 'Hedgehog',
            
            // Food
            '🍏': 'Green Apple', '🍎': 'Red Apple', '🍐': 'Pear', '🍊': 'Tangerine', '🍋': 'Lemon',
            '🍌': 'Banana', '🍉': 'Watermelon', '🍇': 'Grapes', '🍓': 'Strawberry', '🍈': 'Melon',
            '🍒': 'Cherries', '🍑': 'Peach', '🥭': 'Mango', '🍍': 'Pineapple', '🥥': 'Coconut',
            '🥝': 'Kiwi Fruit', '🍅': 'Tomato', '🍆': 'Eggplant', '🥑': 'Avocado', '🥦': 'Broccoli',
            '🥬': 'Leafy Green', '🥒': 'Cucumber', '🌶️': 'Hot Pepper', '🌽': 'Ear of Corn', '🥕': 'Carrot',
            '🫒': 'Olive', '🥔': 'Potato', '🍠': 'Roasted Sweet Potato', '🥐': 'Croissant', '🥯': 'Bagel',
            '🍞': 'Bread', '🥖': 'Baguette Bread', '🥨': 'Pretzel', '🧀': 'Cheese', '🥚': 'Egg',
            '🍳': 'Cooking', '🥞': 'Pancakes', '🥓': 'Bacon', '🥩': 'Cut of Meat', '🍗': 'Poultry Leg',
            '🍖': 'Meat on Bone', '🦴': 'Bone', '🌭': 'Hot Dog', '🍔': 'Hamburger', '🍟': 'French Fries',
            '🍕': 'Pizza', '🫓': 'Flatbread', '🥪': 'Sandwich', '🥙': 'Stuffed Flatbread', '🧆': 'Falafel',
            '🌮': 'Taco', '🌯': 'Burrito', '🫔': 'Tamale', '🥗': 'Green Salad', '🥘': 'Shallow Pan of Food',
            '🫕': 'Fondue', '🥫': 'Canned Food', '🍝': 'Spaghetti', '🍜': 'Steaming Bowl', '🍲': 'Pot of Food',
            '🍛': 'Curry Rice', '🍣': 'Sushi', '🍱': 'Bento Box', '🥟': 'Dumpling', '🦪': 'Oyster',
            '🍤': 'Fried Shrimp', '🍙': 'Rice Ball', '🍚': 'Cooked Rice', '🍘': 'Rice Cracker', '🍥': 'Fish Cake',
            '🥠': 'Fortune Cookie', '🥮': 'Moon Cake', '🍢': 'Oden', '🍡': 'Dango', '🍧': 'Shaved Ice',
            '🍨': 'Ice Cream', '🍦': 'Soft Ice Cream', '🥧': 'Pie', '🧁': 'Cupcake', '🍰': 'Shortcake',
            '🎂': 'Birthday Cake', '🍮': 'Custard', '🍭': 'Lollipop', '🍬': 'Candy', '🍫': 'Chocolate Bar',
            '🍿': 'Popcorn', '🍩': 'Doughnut', '🍪': 'Cookie', '🌰': 'Chestnut', '🥜': 'Peanuts',
            '🍯': 'Honey Pot', '🥛': 'Glass of Milk', '🍼': 'Baby Bottle', '🫖': 'Teapot', '☕️': 'Hot Beverage',
            '☕': 'Hot Beverage', '🍵': 'Teacup Without Handle', '🧃': 'Beverage Box', '🥤': 'Cup With Straw',
            '🧋': 'Bubble Tea', '🍶': 'Sake', '🍺': 'Beer Mug', '🍻': 'Clinking Beer Mugs', '🥂': 'Clinking Glasses',
            '🍷': 'Wine Glass', '🥃': 'Tumbler Glass', '🍸': 'Cocktail Glass', '🍹': 'Tropical Drink',
            '🧉': 'Mate', '🍾': 'Bottle With Popping Cork', '🧊': 'Ice',
            
            // Add more common emojis for better tooltip coverage
            // Smileys & People (most common ones)
            '😀': 'Grinning Face', '😃': 'Grinning Face With Big Eyes', '😄': 'Grinning Face With Smiling Eyes',
            '😁': 'Beaming Face With Smiling Eyes', '😆': 'Grinning Squinting Face', '😅': 'Grinning Face With Sweat',
            '🤣': 'Rolling on the Floor Laughing', '😂': 'Face With Tears of Joy', '🙂': 'Slightly Smiling Face',
            '🙃': 'Upside-Down Face', '😉': 'Winking Face', '😊': 'Smiling Face With Smiling Eyes',
            '😇': 'Smiling Face With Halo', '🥰': 'Smiling Face With Hearts', '😍': 'Smiling Face With Heart-Eyes',
            '🤩': 'Star-Struck', '😘': 'Face Blowing a Kiss', '😗': 'Kissing Face',
            '😚': 'Kissing Face With Closed Eyes', '😙': 'Kissing Face With Smiling Eyes', '😋': 'Face Savoring Food',
            '😛': 'Face With Tongue', '😜': 'Winking Face With Tongue', '🤪': 'Zany Face',
            '😝': 'Squinting Face With Tongue', '🤑': 'Money-Mouth Face', '🤗': 'Hugging Face',
            '🤭': 'Face With Hand Over Mouth', '🤫': 'Shushing Face', '🤔': 'Thinking Face',
            '🤐': 'Face With Zipper Mouth', '🤨': 'Face With Raised Eyebrow', '😐': 'Neutral Face',
            '😑': 'Expressionless Face', '😶': 'Face Without Mouth', '😏': 'Smirking Face',
            '😒': 'Unamused Face', '🙄': 'Face With Rolling Eyes', '😬': 'Grimacing Face',
            '🤥': 'Lying Face', '😌': 'Relieved Face', '😔': 'Pensive Face',
            '😪': 'Sleepy Face', '🤤': 'Drooling Face', '😴': 'Sleeping Face',
            '😷': 'Face With Medical Mask', '🤒': 'Face With Thermometer', '🤕': 'Face With Head-Bandage',
            '🤢': 'Nauseated Face', '🤮': 'Face Vomiting', '🤧': 'Sneezing Face',
            '🥵': 'Hot Face', '🥶': 'Cold Face', '😵': 'Dizzy Face',
            '🤯': 'Exploding Head', '🤠': 'Cowboy Hat Face', '🥳': 'Partying Face',
            '😎': 'Smiling Face With Sunglasses', '🤓': 'Nerd Face', '🧐': 'Face With Monocle',
            '😕': 'Confused Face', '😟': 'Worried Face', '🙁': 'Slightly Frowning Face',
            '☹️': 'Frowning Face', '😮': 'Face With Open Mouth', '😯': 'Hushed Face',
            '😲': 'Astonished Face', '😳': 'Flushed Face', '🥺': 'Pleading Face',
            '😦': 'Frowning Face With Open Mouth', '😧': 'Anguished Face', '😨': 'Fearful Face',
            '😰': 'Anxious Face With Sweat', '😥': 'Sad but Relieved Face', '😢': 'Crying Face',
            '😭': 'Loudly Crying Face', '😱': 'Face Screaming in Fear', '😖': 'Confounded Face',
            '😣': 'Persevering Face', '😞': 'Disappointed Face', '😓': 'Downcast Face With Sweat',
            '😩': 'Weary Face', '😫': 'Tired Face', '🥱': 'Yawning Face',
            '😤': 'Face With Steam From Nose', '😡': 'Pouting Face', '😠': 'Angry Face',
            '🤬': 'Face With Symbols on Mouth', '😈': 'Smiling Face With Horns', '👿': 'Angry Face With Horns',
            '💀': 'Skull', '☠️': 'Skull and Crossbones', '💩': 'Pile of Poo',
            '🤡': 'Clown Face', '👹': 'Ogre', '👺': 'Goblin',
            '👻': 'Ghost', '👽': 'Alien', '👾': 'Alien Monster',
            '🤖': 'Robot', '😺': 'Grinning Cat', '😸': 'Grinning Cat With Smiling Eyes',
            '😹': 'Cat With Tears of Joy', '😻': 'Smiling Cat With Heart-Eyes', '😼': 'Cat With Wry Smile',
            '😽': 'Kissing Cat', '🙀': 'Weary Cat', '😿': 'Crying Cat',
            '😾': 'Pouting Cat',
            
            // Gestures & Body Parts
            '👋': 'Waving Hand', '🤚': 'Raised Back of Hand', '🖐️': 'Hand With Fingers Splayed',
            '✋': 'Raised Hand', '🖖': 'Vulcan Salute', '👌': 'OK Hand',
            '🤌': 'Pinched Fingers', '🤏': 'Pinching Hand', '✌️': 'Victory Hand',
            '🤞': 'Crossed Fingers', '🤟': 'Love-You Gesture', '🤘': 'Sign of the Horns',
            '🤙': 'Call Me Hand', '👈': 'Backhand Index Pointing Left', '👉': 'Backhand Index Pointing Right',
            '👆': 'Backhand Index Pointing Up', '🖕': 'Middle Finger', '👇': 'Backhand Index Pointing Down',
            '☝️': 'Index Pointing Up', '👍': 'Thumbs Up', '👎': 'Thumbs Down',
            '✊': 'Raised Fist', '👊': 'Oncoming Fist', '🤛': 'Left-Facing Fist',
            '🤜': 'Right-Facing Fist', '👏': 'Clapping Hands', '🙌': 'Raising Hands',
            '👐': 'Open Hands', '🤲': 'Palms Up Together', '🤝': 'Handshake',
            '🙏': 'Folded Hands', '✍️': 'Writing Hand', '💪': 'Flexed Biceps',
            '🦾': 'Mechanical Arm', '🦿': 'Mechanical Leg', '🦵': 'Leg',
            '🦶': 'Foot', '👂': 'Ear', '🦻': 'Ear With Hearing Aid',
            '👃': 'Nose', '🧠': 'Brain', '🫀': 'Anatomical Heart',
            '🫁': 'Lungs', '🦷': 'Tooth', '🦴': 'Bone',
            '👀': 'Eyes', '👁️': 'Eye', '👅': 'Tongue',
            '👄': 'Mouth',
            
            // Objects & Household Items
            '🗑️': 'Wastebasket',
            '🧹': 'Broom',
            '🧼': 'Soap',
            '🚽': 'Toilet',
            '🚿': 'Shower',
            '🛁': 'Bathtub',
            '🪥': 'Toothbrush',
            '🪒': 'Razor',
            '🧴': 'Lotion Bottle',
            '🧷': 'Safety Pin',
            '🪠': 'Plunger',
            '🧺': 'Basket',
            '🧻': 'Roll of Paper',
            '🛒': 'Shopping Cart',
            '🚪': 'Door',
            '🛋️': 'Couch',
            '🛏️': 'Bed',
            '🛌': 'Person in Bed',
            '🧸': 'Teddy Bear',
            '🪆': 'Nesting Dolls',
            '🖼️': 'Framed Picture',
            '🪞': 'Mirror',
            '🪟': 'Window',
            '🛍️': 'Shopping Bags',
            '🎁': 'Wrapped Gift',
            '🎈': 'Balloon',
            '🎏': 'Carp Streamer',
            '🎀': 'Ribbon',
            '🪄': 'Magic Wand',
            '🪅': 'Piñata',
            '🎊': 'Confetti Ball',
            '🎉': 'Party Popper',
            '🎎': 'Japanese Dolls',
            '🏮': 'Red Paper Lantern',
            '🎐': 'Wind Chime',
            '🧧': 'Red Envelope',
            
            // People & Family
            '👶': 'Baby', '🧒': 'Child', '👦': 'Boy', '👧': 'Girl', '🧑': 'Person', '👱': 'Person: Blond Hair',
            '👨': 'Man', '🧔': 'Person: Beard', '👨‍🦰': 'Man: Red Hair', '👨‍🦱': 'Man: Curly Hair', '👨‍🦳': 'Man: White Hair', '👨‍🦲': 'Man: Bald',
            '👩': 'Woman', '👩‍🦰': 'Woman: Red Hair', '🧑‍🦰': 'Person: Red Hair', '👩‍🦱': 'Woman: Curly Hair', '🧑‍🦱': 'Person: Curly Hair',
            '👩‍🦳': 'Woman: White Hair', '🧑‍🦳': 'Person: White Hair', '👩‍🦲': 'Woman: Bald', '🧑‍🦲': 'Person: Bald',
            '👱‍♀️': 'Woman: Blond Hair', '👱‍♂️': 'Man: Blond Hair', '🧓': 'Older Person', '👴': 'Old Man', '👵': 'Old Woman',
            '🙍': 'Person Frowning', '🙍‍♂️': 'Man Frowning', '🙍‍♀️': 'Woman Frowning',
            '🙎': 'Person Pouting', '🙎‍♂️': 'Man Pouting', '🙎‍♀️': 'Woman Pouting',
            '🙅': 'Person Gesturing NO', '🙅‍♂️': 'Man Gesturing NO', '🙅‍♀️': 'Woman Gesturing NO',
            '🙆': 'Person Gesturing OK', '🙆‍♂️': 'Man Gesturing OK', '🙆‍♀️': 'Woman Gesturing OK',
            '💁': 'Person Tipping Hand', '💁‍♂️': 'Man Tipping Hand', '💁‍♀️': 'Woman Tipping Hand',
            '🙋': 'Person Raising Hand', '🙋‍♂️': 'Man Raising Hand', '🙋‍♀️': 'Woman Raising Hand',
            '🧏': 'Deaf Person', '🧏‍♂️': 'Deaf Man', '🧏‍♀️': 'Deaf Woman',
            '🤦': 'Person Facepalming', '🤦‍♂️': 'Man Facepalming', '🤦‍♀️': 'Woman Facepalming',
            '🤷': 'Person Shrugging', '🤷‍♂️': 'Man Shrugging', '🤷‍♀️': 'Woman Shrugging',
            '🧑‍⚕️': 'Health Worker', '👨‍⚕️': 'Man Health Worker', '👩‍⚕️': 'Woman Health Worker',
            '🧑‍🎓': 'Student', '👨‍🎓': 'Man Student', '👩‍🎓': 'Woman Student',
            '🧑‍🏫': 'Teacher', '👨‍🏫': 'Man Teacher', '👩‍🏫': 'Woman Teacher',
            '🧑‍⚖️': 'Judge', '👨‍⚖️': 'Man Judge', '👩‍⚖️': 'Woman Judge',
            '🧑‍🌾': 'Farmer', '👨‍🌾': 'Man Farmer', '👩‍🌾': 'Woman Farmer',
            '🧑‍🍳': 'Cook', '👨‍🍳': 'Man Cook', '👩‍🍳': 'Woman Cook',
            '🧑‍🔧': 'Mechanic', '👨‍🔧': 'Man Mechanic', '👩‍🔧': 'Woman Mechanic',
            '🧑‍🏭': 'Factory Worker', '👨‍🏭': 'Man Factory Worker', '👩‍🏭': 'Woman Factory Worker',
            '🧑‍💼': 'Office Worker', '👨‍💼': 'Man Office Worker', '👩‍💼': 'Woman Office Worker',
            '🧑‍🔬': 'Scientist', '👨‍🔬': 'Man Scientist', '👩‍🔬': 'Woman Scientist',
            '🧑‍💻': 'Technologist', '👨‍💻': 'Man Technologist', '👩‍💻': 'Woman Technologist',
            '🧑‍🎤': 'Singer', '👨‍🎤': 'Man Singer', '👩‍🎤': 'Woman Singer',
            '🧑‍🎨': 'Artist', '👨‍🎨': 'Man Artist', '👩‍🎨': 'Woman Artist',
            '🧑‍✈️': 'Pilot', '👨‍✈️': 'Man Pilot', '👩‍✈️': 'Woman Pilot',
            '🧑‍🚀': 'Astronaut', '👨‍🚀': 'Man Astronaut', '👩‍🚀': 'Woman Astronaut',
            '🧑‍🚒': 'Firefighter', '👨‍🚒': 'Man Firefighter', '👩‍🚒': 'Woman Firefighter',
            '👮': 'Police Officer', '👮‍♂️': 'Man Police Officer', '👮‍♀️': 'Woman Police Officer',
            '🕵️': 'Detective', '🕵️‍♂️': 'Man Detective', '🕵️‍♀️': 'Woman Detective',
            '💂': 'Guard', '💂‍♂️': 'Man Guard', '💂‍♀️': 'Woman Guard',
            '🥷': 'Ninja', '👷': 'Construction Worker', '👷‍♂️': 'Man Construction Worker', '👷‍♀️': 'Woman Construction Worker',
            '🤴': 'Prince', '👸': 'Princess', '👳': 'Person Wearing Turban', '👳‍♂️': 'Man Wearing Turban', '👳‍♀️': 'Woman Wearing Turban',
            '👲': 'Person With Skullcap', '🧕': 'Woman With Headscarf', '🤵': 'Person in Tuxedo', '🤵‍♂️': 'Man in Tuxedo', '🤵‍♀️': 'Woman in Tuxedo',
            '👰': 'Person With Veil', '👰‍♂️': 'Man With Veil', '👰‍♀️': 'Woman With Veil',
            '🤰': 'Pregnant Woman', '🤱': 'Breast-Feeding', '👼': 'Baby Angel', '🎅': 'Santa Claus', '🤶': 'Mrs. Claus',
            '🦸': 'Superhero', '🦸‍♂️': 'Man Superhero', '🦸‍♀️': 'Woman Superhero',
            '🦹': 'Supervillain', '🦹‍♂️': 'Man Supervillain', '🦹‍♀️': 'Woman Supervillain',
            '🧙': 'Mage', '🧙‍♂️': 'Man Mage', '🧙‍♀️': 'Woman Mage',
            '🧚': 'Fairy', '🧚‍♂️': 'Man Fairy', '🧚‍♀️': 'Woman Fairy',
            '🧛': 'Vampire', '🧛‍♂️': 'Man Vampire', '🧛‍♀️': 'Woman Vampire',
            '🧜': 'Merperson', '🧜‍♂️': 'Merman', '🧜‍♀️': 'Mermaid',
            '🧝': 'Elf', '🧝‍♂️': 'Man Elf', '🧝‍♀️': 'Woman Elf',
            '🧞': 'Genie', '🧞‍♂️': 'Man Genie', '🧞‍♀️': 'Woman Genie',
            '🧟': 'Zombie', '🧟‍♂️': 'Man Zombie', '🧟‍♀️': 'Woman Zombie',
            '💆': 'Person Getting Massage', '💆‍♂️': 'Man Getting Massage', '💆‍♀️': 'Woman Getting Massage',
            '💇': 'Person Getting Haircut', '💇‍♂️': 'Man Getting Haircut', '💇‍♀️': 'Woman Getting Haircut',
            '🚶': 'Person Walking', '🚶‍♂️': 'Man Walking', '🚶‍♀️': 'Woman Walking',
            '🧍': 'Person Standing', '🧍‍♂️': 'Man Standing', '🧍‍♀️': 'Woman Standing',
            '🧎': 'Person Kneeling', '🧎‍♂️': 'Man Kneeling', '🧎‍♀️': 'Woman Kneeling',
            '🏃': 'Person Running', '🏃‍♂️': 'Man Running', '🏃‍♀️': 'Woman Running',
            '💃': 'Woman Dancing', '🕺': 'Man Dancing', '🕴️': 'Person in Suit Levitating',
            '👯': 'People With Bunny Ears', '👯‍♂️': 'Men With Bunny Ears', '👯‍♀️': 'Women With Bunny Ears',
            '🧘': 'Person in Lotus Position', '🧘‍♂️': 'Man in Lotus Position', '🧘‍♀️': 'Woman in Lotus Position',
            '🛀': 'Person Taking Bath', '🛌': 'Person in Bed',
            '👭': 'Women Holding Hands', '👫': 'Woman and Man Holding Hands', '👬': 'Men Holding Hands',
            '💏': 'Kiss', '💑': 'Couple With Heart',
            '👪': 'Family', '👨‍👩‍👧': 'Family: Man, Woman, Girl', '👨‍👩‍👧‍👦': 'Family: Man, Woman, Girl, Boy',
            '👨‍👩‍👦‍👦': 'Family: Man, Woman, Boy, Boy', '👨‍👩‍👧‍👧': 'Family: Man, Woman, Girl, Girl',
            '👩‍👩‍👦': 'Family: Woman, Woman, Boy', '👩‍👩‍👧': 'Family: Woman, Woman, Girl',
            '👩‍👩‍👧‍👦': 'Family: Woman, Woman, Girl, Boy', '👩‍👩‍👦‍👦': 'Family: Woman, Woman, Boy, Boy',
            '👩‍👩‍👧‍👧': 'Family: Woman, Woman, Girl, Girl',
            '👨‍👨‍👦': 'Family: Man, Man, Boy', '👨‍👨‍👧': 'Family: Man, Man, Girl',
            '👨‍👨‍👧‍👦': 'Family: Man, Man, Girl, Boy', '👨‍👨‍👦‍👦': 'Family: Man, Man, Boy, Boy',
            '👨‍👨‍👧‍👧': 'Family: Man, Man, Girl, Girl',
            '👩‍👦': 'Family: Woman, Boy', '👩‍👧': 'Family: Woman, Girl',
            '👩‍👧‍👦': 'Family: Woman, Girl, Boy', '👩‍👦‍👦': 'Family: Woman, Boy, Boy', '👩‍👧‍👧': 'Family: Woman, Girl, Girl',
            '👨‍👦': 'Family: Man, Boy', '👨‍👧': 'Family: Man, Girl',
            '👨‍👧‍👦': 'Family: Man, Girl, Boy', '👨‍👦‍👦': 'Family: Man, Boy, Boy', '👨‍👧‍👧': 'Family: Man, Girl, Girl',
            
            // Animals & Nature (additional)
            '🌲': 'Evergreen Tree', '🌳': 'Deciduous Tree', '🌴': 'Palm Tree', '🌵': 'Cactus', '🌾': 'Sheaf of Rice',
            '🌿': 'Herb', '☘️': 'Shamrock', '🍀': 'Four Leaf Clover', '🍁': 'Maple Leaf', '🍂': 'Fallen Leaf',
            '🍃': 'Leaf Fluttering in Wind', '🍄': 'Mushroom', '🐚': 'Spiral Shell', '🪨': 'Rock',
            '💐': 'Bouquet', '🌷': 'Tulip', '🌹': 'Rose', '🥀': 'Wilted Flower', '🌺': 'Hibiscus',
            '🌻': 'Sunflower', '🌼': 'Blossom',
            '🌏': 'Globe Showing Asia-Australia', '🌎': 'Globe Showing Americas', '🌍': 'Globe Showing Europe-Africa',
            '🌕': 'Full Moon', '🌖': 'Waning Gibbous Moon', '🌗': 'Last Quarter Moon', '🌘': 'Waning Crescent Moon',
            '🌑': 'New Moon', '🌒': 'Waxing Crescent Moon', '🌓': 'First Quarter Moon', '🌔': 'Waxing Gibbous Moon',
            '🌙': 'Crescent Moon', '🌚': 'New Moon Face', '🌛': 'First Quarter Moon Face', '🌜': 'Last Quarter Moon Face',
            '🌝': 'Full Moon Face', '🌞': 'Sun With Face',
            '⭐': 'Star', '🌟': 'Glowing Star', '💫': 'Dizzy', '✨': 'Sparkles', '☄️': 'Comet',
            '💥': 'Collision', '🔥': 'Fire', '☀️': 'Sun', '🌤️': 'Sun Behind Small Cloud',
            '⛅': 'Sun Behind Cloud', '🌥️': 'Sun Behind Large Cloud', '☁️': 'Cloud',
            '🌦️': 'Sun Behind Rain Cloud', '🌧️': 'Cloud With Rain', '⛈️': 'Cloud With Lightning and Rain',
            '🌩️': 'Cloud With Lightning', '⚡': 'High Voltage', '☔': 'Umbrella With Rain Drops',
            '⛄': 'Snowman Without Snow', '❄️': 'Snowflake', '🌊': 'Water Wave', '💧': 'Droplet', '💦': 'Sweat Droplets',
            
            // Travel & Places
            '🚗': 'Automobile', '🚕': 'Taxi', '🚙': 'Sport Utility Vehicle', '🚌': 'Bus', '🚎': 'Trolleybus',
            '🏎️': 'Racing Car', '🚓': 'Police Car', '🚑': 'Ambulance', '🚒': 'Fire Engine', '🚐': 'Minibus',
            '🛻': 'Pickup Truck', '🚚': 'Delivery Truck', '🚛': 'Articulated Lorry', '🚜': 'Tractor',
            '🦯': 'White Cane', '🦽': 'Manual Wheelchair', '🦼': 'Motorized Wheelchair', '🛴': 'Kick Scooter',
            '🚲': 'Bicycle', '🛵': 'Motor Scooter', '🏍️': 'Motorcycle', '🛺': 'Auto Rickshaw',
            '🚨': 'Police Car Light', '🚔': 'Oncoming Police Car', '🚍': 'Oncoming Bus', '🚘': 'Oncoming Automobile', '🚖': 'Oncoming Taxi',
            '🚡': 'Aerial Tramway', '🚠': 'Mountain Railway', '🚟': 'Suspension Railway',
            '🚃': 'Tram Car', '🚋': 'Tram', '🚞': 'Mountain Railway', '🚝': 'Monorail',
            '🚄': 'High-Speed Train', '🚅': 'Bullet Train', '🚈': 'Light Rail', '🚂': 'Locomotive',
            '🚆': 'Train', '🚇': 'Metro', '🚊': 'Tram', '🚉': 'Station',
            '✈️': 'Airplane', '🛫': 'Airplane Departure', '🛬': 'Airplane Arrival', '🛩️': 'Small Airplane',
            '💺': 'Seat', '🚁': 'Helicopter', '🛸': 'Flying Saucer', '🚀': 'Rocket',
            '🛎️': 'Bellhop Bell', '🧳': 'Luggage',
            '⌛': 'Hourglass Done', '⏳': 'Hourglass Not Done', '⌚': 'Watch', '⏰': 'Alarm Clock',
            '⏱️': 'Stopwatch', '⏲️': 'Timer Clock', '🕰️': 'Mantelpiece Clock',
            '🕛': 'Twelve O\'Clock', '🕧': 'Twelve-Thirty', '🕐': 'One O\'Clock', '🕜': 'One-Thirty',
            '🕑': 'Two O\'Clock', '🕝': 'Two-Thirty', '🕒': 'Three O\'Clock', '🕞': 'Three-Thirty',
            '🕓': 'Four O\'Clock', '🕟': 'Four-Thirty', '🕔': 'Five O\'Clock', '🕠': 'Five-Thirty',
            '🕕': 'Six O\'Clock', '🕡': 'Six-Thirty', '🕖': 'Seven O\'Clock', '🕢': 'Seven-Thirty',
            '🕗': 'Eight O\'Clock', '🕣': 'Eight-Thirty', '🕘': 'Nine O\'Clock', '🕤': 'Nine-Thirty',
            '🕙': 'Ten O\'Clock', '🕥': 'Ten-Thirty', '🕚': 'Eleven O\'Clock', '🕦': 'Eleven-Thirty',
            '🌐': 'Globe With Meridians', '🗺️': 'World Map', '🧭': 'Compass',
            '🏔️': 'Snow-Capped Mountain', '⛰️': 'Mountain', '🌋': 'Volcano', '🗻': 'Mount Fuji',
            '🏕️': 'Camping', '🏖️': 'Beach With Umbrella', '🏜️': 'Desert', '🏝️': 'Desert Island',
            '🏞️': 'National Park', '🏟️': 'Stadium', '🏛️': 'Classical Building', '🏗️': 'Building Construction',
            '🧱': 'Brick', '🏘️': 'Houses', '🏚️': 'Derelict House', '🏠': 'House', '🏡': 'House With Garden',
            '🏢': 'Office Building', '🏣': 'Japanese Post Office', '🏤': 'Post Office', '🏥': 'Hospital',
            '🏦': 'Bank', '🏨': 'Hotel', '🏩': 'Love Hotel', '🏪': 'Convenience Store', '🏫': 'School',
            '🏬': 'Department Store', '🏭': 'Factory', '🏯': 'Japanese Castle', '🏰': 'Castle',
            '💒': 'Wedding', '🗼': 'Tokyo Tower', '🗽': 'Statue of Liberty', '⛪': 'Church',
            '🕌': 'Mosque', '🛕': 'Hindu Temple', '🕍': 'Synagogue', '⛩️': 'Shinto Shrine',
            '🕋': 'Kaaba', '⛲': 'Fountain', '⛺': 'Tent', '🌁': 'Foggy', '🌃': 'Night With Stars',
            '🏙️': 'Cityscape', '🌄': 'Sunrise Over Mountains', '🌅': 'Sunrise', '🌆': 'Cityscape at Dusk',
            '🌇': 'Sunset', '🌉': 'Bridge at Night', '♨️': 'Hot Springs', '🎠': 'Carousel Horse',
            '🎡': 'Ferris Wheel', '🎢': 'Roller Coaster', '💈': 'Barber Pole', '🎪': 'Circus Tent',
            '🚥': 'Horizontal Traffic Light', '🚦': 'Vertical Traffic Light', '🚧': 'Construction',
            '⛽': 'Fuel Pump', '🛣️': 'Motorway', '🛤️': 'Railway Track', '🛢️': 'Oil Drum',
            '🚏': 'Bus Stop', '🗿': 'Moai',
            
            // Activities
            '⚽': 'Soccer Ball', '🏀': 'Basketball', '🏈': 'American Football', '⚾': 'Baseball',
            '🥎': 'Softball', '🎾': 'Tennis', '🏐': 'Volleyball', '🏉': 'Rugby Football',
            '🥏': 'Flying Disc', '🎱': 'Pool 8 Ball', '🏓': 'Ping Pong', '🏸': 'Badminton',
            '🏒': 'Ice Hockey', '🏑': 'Field Hockey', '🥍': 'Lacrosse', '🏏': 'Cricket Game',
            '🥅': 'Goal Net', '⛳': 'Flag in Hole', '🏹': 'Bow and Arrow', '🎣': 'Fishing Pole',
            '🥊': 'Boxing Glove', '🥋': 'Martial Arts Uniform', '🎽': 'Running Shirt',
            '🛹': 'Skateboard', '🛷': 'Sled', '⛸️': 'Ice Skate', '🥌': 'Curling Stone',
            '🎿': 'Skis', '⛷️': 'Skier', '🏂': 'Snowboarder', '🪂': 'Parachute',
            '🏋️': 'Person Lifting Weights', '🤼': 'People Wrestling', '🤸': 'Person Cartwheeling',
            '🤺': 'Person Fencing', '⛹️': 'Person Bouncing Ball', '🤾': 'Person Playing Handball',
            '🏌️': 'Person Golfing', '🏇': 'Horse Racing', '🏄': 'Person Surfing',
            '🏊': 'Person Swimming', '🚣': 'Person Rowing Boat', '🧗': 'Person Climbing',
            '🚵': 'Person Mountain Biking', '🚴': 'Person Biking',
            '🏆': 'Trophy', '🥇': '1st Place Medal', '🥈': '2nd Place Medal', '🥉': '3rd Place Medal',
            '🏅': 'Sports Medal', '🎖️': 'Military Medal', '🏵️': 'Rosette', '🎗️': 'Reminder Ribbon',
            '🎫': 'Ticket', '🎟️': 'Admission Tickets', '🎪': 'Circus Tent',
            '🤹': 'Person Juggling', '🎭': 'Performing Arts', '🩰': 'Ballet Shoes',
            '🎨': 'Artist Palette', '🎬': 'Clapper Board', '🎤': 'Microphone', '🎧': 'Headphone',
            '🎼': 'Musical Score', '🎹': 'Musical Keyboard', '🥁': 'Drum',
            '🎷': 'Saxophone', '🎺': 'Trumpet', '🎸': 'Guitar', '🪕': 'Banjo', '🎻': 'Violin',
            '🎲': 'Game Die', '♟️': 'Chess Pawn', '🎯': 'Direct Hit', '🎳': 'Bowling',
            '🎮': 'Video Game', '🎰': 'Slot Machine', '🧩': 'Puzzle Piece',
            
            // Objects (additional)
            '⌚': 'Watch', '📱': 'Mobile Phone', '📲': 'Mobile Phone With Arrow', '💻': 'Laptop',
            '⌨️': 'Keyboard', '🖥️': 'Desktop Computer', '🖨️': 'Printer', '🖱️': 'Computer Mouse',
            '🖲️': 'Trackball', '🕹️': 'Joystick', '🗜️': 'Clamp', '💾': 'Floppy Disk',
            '💿': 'Optical Disk', '📀': 'DVD', '📼': 'Videocassette',
            '📷': 'Camera', '📸': 'Camera With Flash', '📹': 'Video Camera',
            '🎥': 'Movie Camera', '📽️': 'Film Projector', '🎞️': 'Film Frames',
            '📞': 'Telephone Receiver', '☎️': 'Telephone', '📟': 'Pager', '📠': 'Fax Machine',
            '📺': 'Television', '📻': 'Radio',
            '🎙️': 'Studio Microphone', '🎚️': 'Level Slider', '🎛️': 'Control Knobs',
            '📡': 'Satellite Antenna', '🔋': 'Battery', '🔌': 'Electric Plug',
            '💡': 'Light Bulb', '🔦': 'Flashlight', '🕯️': 'Candle', '🪔': 'Diya Lamp',
            '🧯': 'Fire Extinguisher', '🛢️': 'Oil Drum',
            '💸': 'Money With Wings', '💵': 'Dollar Banknote', '💴': 'Yen Banknote',
            '💶': 'Euro Banknote', '💷': 'Pound Banknote', '💰': 'Money Bag',
            '💳': 'Credit Card', '💎': 'Gem Stone', '⚖️': 'Balance Scale', '🪜': 'Ladder',
            '🧰': 'Toolbox', '🪛': 'Screwdriver', '🔧': 'Wrench', '🔨': 'Hammer',
            '⚒️': 'Hammer and Pick', '🛠️': 'Hammer and Wrench', '⛏️': 'Pick',
            '🪚': 'Carpentry Saw', '🔩': 'Nut and Bolt', '⚙️': 'Gear', '🪤': 'Mouse Trap',
            '⛓️': 'Chains', '🧲': 'Magnet', '🔫': 'Water Pistol', '💣': 'Bomb',
            '🧨': 'Firecracker', '🪓': 'Axe', '🔪': 'Kitchen Knife', '🗡️': 'Dagger',
            '⚔️': 'Crossed Swords', '🛡️': 'Shield', '🚬': 'Cigarette',
            '⚰️': 'Coffin', '🪦': 'Headstone', '⚱️': 'Funeral Urn', '🏺': 'Amphora',
            '🔮': 'Crystal Ball', '📿': 'Prayer Beads', '🧿': 'Nazar Amulet', '💈': 'Barber Pole',
            '⚗️': 'Alembic', '🔭': 'Telescope', '🔬': 'Microscope', '🕳️': 'Hole',
            '🩹': 'Adhesive Bandage', '🩺': 'Stethoscope', '💊': 'Pill', '💉': 'Syringe',
            '🩸': 'Drop of Blood', '🧬': 'DNA', '🦠': 'Microbe', '🧫': 'Petri Dish',
            '🧪': 'Test Tube', '🌡️': 'Thermometer', '🪠': 'Plunger',
            '🚪': 'Door', '🛋️': 'Couch and Lamp', '🛏️': 'Bed',
            '🛍️': 'Shopping Bags', '✉️': 'Envelope', '📩': 'Envelope With Arrow',
            '📨': 'Incoming Envelope', '📧': 'E-Mail', '💌': 'Love Letter',
            '📥': 'Inbox Tray', '📤': 'Outbox Tray', '📦': 'Package',
            '🏷️': 'Label', '📪': 'Closed Mailbox With Lowered Flag', '📫': 'Closed Mailbox With Raised Flag',
            '📬': 'Open Mailbox With Raised Flag', '📭': 'Open Mailbox With Lowered Flag',
            '📮': 'Postbox', '📯': 'Postal Horn', '📜': 'Scroll', '📃': 'Page With Curl',
            '📄': 'Page Facing Up', '📑': 'Bookmark Tabs', '🧾': 'Receipt',
            '📊': 'Bar Chart', '📈': 'Chart Increasing', '📉': 'Chart Decreasing',
            '🗒️': 'Spiral Notepad', '🗓️': 'Spiral Calendar', '📆': 'Tear-Off Calendar',
            '📅': 'Calendar', '📇': 'Card Index', '🗃️': 'Card File Box',
            '🗳️': 'Ballot Box With Ballot', '🗄️': 'File Cabinet', '📋': 'Clipboard',
            '📁': 'File Folder', '📂': 'Open File Folder', '🗂️': 'Card Index Dividers',
            '📌': 'Pushpin', '📍': 'Round Pushpin', '📎': 'Paperclip',
            '🖇️': 'Linked Paperclips', '📏': 'Straight Ruler', '📐': 'Triangular Ruler',
            '✂️': 'Scissors', '🔒': 'Locked', '🔓': 'Unlocked',
            '🔏': 'Locked With Pen', '🔐': 'Locked With Key', '🔑': 'Key', '🗝️': 'Old Key',
            '🪝': 'Hook', '🪡': 'Sewing Needle', '🧵': 'Thread', '🧶': 'Yarn', '🪢': 'Knot',
            
            // Symbols
            '❤️': 'Red Heart', '🧡': 'Orange Heart', '💛': 'Yellow Heart', '💚': 'Green Heart',
            '💙': 'Blue Heart', '💜': 'Purple Heart', '🖤': 'Black Heart', '🤍': 'White Heart',
            '🤎': 'Brown Heart', '💔': 'Broken Heart', '❣️': 'Heart Exclamation',
            '💕': 'Two Hearts', '💞': 'Revolving Hearts', '💓': 'Beating Heart',
            '💗': 'Growing Heart', '💖': 'Sparkling Heart', '💘': 'Heart With Arrow',
            '💝': 'Heart With Ribbon', '💟': 'Heart Decoration',
            '☮️': 'Peace Symbol', '✝️': 'Latin Cross', '☪️': 'Star and Crescent',
            '🕉️': 'Om', '☸️': 'Wheel of Dharma', '✡️': 'Star of David',
            '🔯': 'Dotted Six-Pointed Star', '🕎': 'Menorah', '☯️': 'Yin Yang',
            '☦️': 'Orthodox Cross', '🛐': 'Place of Worship', '⛎': 'Ophiuchus',
            '♈': 'Aries', '♉': 'Taurus', '♊': 'Gemini', '♋': 'Cancer',
            '♌': 'Leo', '♍': 'Virgo', '♎': 'Libra', '♏': 'Scorpio',
            '♐': 'Sagittarius', '♑': 'Capricorn', '♒': 'Aquarius', '♓': 'Pisces',
            '🆔': 'ID Button', '⚛️': 'Atom Symbol', '🉑': 'Japanese "Acceptable" Button',
            '☢️': 'Radioactive', '☣️': 'Biohazard', '📴': 'Mobile Phone Off',
            '📳': 'Vibration Mode', '🈶': 'Japanese "Not Free of Charge" Button',
            '🈚': 'Japanese "Free of Charge" Button', '🈸': 'Japanese "Application" Button',
            '🈺': 'Japanese "Open for Business" Button', '🈷️': 'Japanese "Monthly Amount" Button',
            '✴️': 'Eight-Pointed Star', '🆚': 'VS Button', '💮': 'White Flower',
            '🉐': 'Japanese "Bargain" Button', '㊙️': 'Japanese "Secret" Button',
            '㊗️': 'Japanese "Congratulations" Button', '🈴': 'Japanese "Passing Grade" Button',
            '🈵': 'Japanese "No Vacancy" Button', '🈹': 'Japanese "Discount" Button',
            '🈲': 'Japanese "Prohibited" Button', '🅰️': 'A Button (Blood Type)',
            '🅱️': 'B Button (Blood Type)', '🆎': 'AB Button (Blood Type)',
            '🆑': 'CL Button', '🅾️': 'O Button (Blood Type)', '🆘': 'SOS Button',
            '❌': 'Cross Mark', '⭕': 'Heavy Large Circle', '🛑': 'Stop Sign',
            '⛔': 'No Entry', '📛': 'Name Badge', '🚫': 'Prohibited',
            '💯': 'Hundred Points', '💢': 'Anger Symbol', '🚷': 'No Pedestrians',
            '🚯': 'No Littering', '🚳': 'No Bicycles', '🚱': 'Non-Potable Water',
            '🔞': 'No One Under Eighteen', '📵': 'No Mobile Phones', '🚭': 'No Smoking',
            '❗': 'Exclamation Mark', '❓': 'Question Mark', '❕': 'White Exclamation Mark',
            '❔': 'White Question Mark', '‼️': 'Double Exclamation Mark', '⁉️': 'Exclamation Question Mark',
            '🔅': 'Dim Button', '🔆': 'Bright Button', '〽️': 'Part Alternation Mark',
            '⚠️': 'Warning', '🚸': 'Children Crossing', '🔱': 'Trident Emblem',
            '⚜️': 'Fleur-de-lis', '🔰': 'Japanese Symbol for Beginner', '♻️': 'Recycling Symbol',
            '✅': 'Check Mark Button', '🈯': 'Japanese "Reserved" Button', '💹': 'Chart Increasing With Yen',
            '❇️': 'Sparkle', '✳️': 'Eight-Spoked Asterisk', '❎': 'Cross Mark Button',
            '💠': 'Diamond With a Dot', 'Ⓜ️': 'Circled M', '🌀': 'Cyclone',
            '💤': 'ZZZ', '🏧': 'ATM Sign', '🚾': 'Water Closet', '♿': 'Wheelchair Symbol',
            '🅿️': 'P Button', '🈳': 'Japanese "Vacancy" Button', '🈂️': 'Japanese "Service Charge" Button',
            '🛂': 'Passport Control', '🛃': 'Customs', '🛄': 'Baggage Claim',
            '🛅': 'Left Luggage', '🚹': 'Men\'s Room', '🚺': 'Women\'s Room',
            '🚼': 'Baby Symbol', '🚻': 'Restroom', '🚮': 'Litter in Bin Sign',
            '🎦': 'Cinema', '📶': 'Antenna Bars', '🈁': 'Japanese "Here" Button',
            '🔣': 'Input Symbols', '🔄': 'Counterclockwise Arrows Button', '🔤': 'Input Latin Letters',
            'ℹ️': 'Information', '🔡': 'Input Latin Lowercase', '🔢': 'Input Numbers',
            '🔠': 'Input Latin Uppercase', '#️⃣': 'Keycap: #', '*️⃣': 'Keycap: *',
            '0️⃣': 'Keycap: 0', '1️⃣': 'Keycap: 1', '2️⃣': 'Keycap: 2', '3️⃣': 'Keycap: 3',
            '4️⃣': 'Keycap: 4', '5️⃣': 'Keycap: 5', '6️⃣': 'Keycap: 6', '7️⃣': 'Keycap: 7',
            '8️⃣': 'Keycap: 8', '9️⃣': 'Keycap: 9', '🔟': 'Keycap: 10',
            '🆒': 'COOL Button', '🆓': 'FREE Button', '🆕': 'NEW Button',
            '🆖': 'NG Button', '🆗': 'OK Button', '🆙': 'UP! Button',
            '🔴': 'Red Circle', '🟠': 'Orange Circle', '🟡': 'Yellow Circle',
            '🟢': 'Green Circle', '🔵': 'Blue Circle', '🟣': 'Purple Circle',
            '⚫': 'Black Circle', '⚪': 'White Circle', '🟤': 'Brown Circle',
            '🔶': 'Large Orange Diamond', '🔷': 'Large Blue Diamond',
            '🔸': 'Small Orange Diamond', '🔹': 'Small Blue Diamond',
            '🔺': 'Red Triangle Pointed Up', '🔻': 'Red Triangle Pointed Down',
            '🔘': 'Radio Button', '🔳': 'White Square Button', '🔲': 'Black Square Button',
            '▪️': 'Black Small Square', '▫️': 'White Small Square',
            '◾': 'Black Medium-Small Square', '◽': 'White Medium-Small Square',
            '◼️': 'Black Medium Square', '◻️': 'White Medium Square',
            '🟥': 'Red Square', '🟧': 'Orange Square', '🟨': 'Yellow Square',
            '🟩': 'Green Square', '🟦': 'Blue Square', '🟪': 'Purple Square',
            '⬛': 'Black Large Square', '⬜': 'White Large Square', '🟫': 'Brown Square',
            '🔈': 'Speaker Low Volume', '🔇': 'Muted', '🔉': 'Speaker Medium Volume',
            '🔊': 'Speaker High Volume', '🔔': 'Bell', '🔕': 'Bell With Slash',
            '📣': 'Megaphone', '📢': 'Loudspeaker', '💬': 'Speech Balloon',
            '💭': 'Thought Balloon', '🗯️': 'Right Anger Bubble',
            '♠️': 'Spade Suit', '♣️': 'Club Suit', '♥️': 'Heart Suit', '♦️': 'Diamond Suit',
            '🃏': 'Joker', '🎴': 'Flower Playing Cards', '🀄': 'Mahjong Red Dragon',
            '🕐': 'One O\'Clock', '🕑': 'Two O\'Clock', '🕒': 'Three O\'Clock',
            '🕓': 'Four O\'Clock', '🕔': 'Five O\'Clock', '🕕': 'Six O\'Clock',
            '🕖': 'Seven O\'Clock', '🕗': 'Eight O\'Clock', '🕘': 'Nine O\'Clock',
            '🕙': 'Ten O\'Clock', '🕚': 'Eleven O\'Clock', '🕛': 'Twelve O\'Clock',
            '🕜': 'One-Thirty', '🕝': 'Two-Thirty', '🕞': 'Three-Thirty',
            '🕟': 'Four-Thirty', '🕠': 'Five-Thirty', '🕡': 'Six-Thirty',
            '🕢': 'Seven-Thirty', '🕣': 'Eight-Thirty', '🕤': 'Nine-Thirty',
            '🕥': 'Ten-Thirty', '🕦': 'Eleven-Thirty', '🕧': 'Twelve-Thirty',
            
            // Flags
            '🏳️': 'White Flag', '🏴': 'Black Flag', '🏁': 'Chequered Flag', '🚩': 'Triangular Flag',
            '🏳️‍🌈': 'Rainbow Flag', '🏳️‍⚧️': 'Transgender Flag',
            '🇦🇨': 'Flag: Ascension Island', '🇦🇩': 'Flag: Andorra', '🇦🇪': 'Flag: United Arab Emirates',
            '🇦🇫': 'Flag: Afghanistan', '🇦🇬': 'Flag: Antigua & Barbuda', '🇦🇮': 'Flag: Anguilla',
            '🇦🇱': 'Flag: Albania', '🇦🇲': 'Flag: Armenia', '🇦🇴': 'Flag: Angola',
            '🇦🇶': 'Flag: Antarctica', '🇦🇷': 'Flag: Argentina', '🇦🇸': 'Flag: American Samoa',
            '🇦🇹': 'Flag: Austria', '🇦🇺': 'Flag: Australia', '🇦🇼': 'Flag: Aruba',
            '🇦🇽': 'Flag: Åland Islands', '🇦🇿': 'Flag: Azerbaijan',
            '🇧🇦': 'Flag: Bosnia & Herzegovina', '🇧🇧': 'Flag: Barbados', '🇧🇩': 'Flag: Bangladesh',
            '🇧🇪': 'Flag: Belgium', '🇧🇫': 'Flag: Burkina Faso', '🇧🇬': 'Flag: Bulgaria',
            '🇧🇭': 'Flag: Bahrain', '🇧🇮': 'Flag: Burundi', '🇧🇯': 'Flag: Benin',
            '🇧🇱': 'Flag: St. Barthélemy', '🇧🇲': 'Flag: Bermuda', '🇧🇳': 'Flag: Brunei',
            '🇧🇴': 'Flag: Bolivia', '🇧🇶': 'Flag: Caribbean Netherlands', '🇧🇷': 'Flag: Brazil',
            '🇧🇸': 'Flag: Bahamas', '🇧🇹': 'Flag: Bhutan', '🇧🇻': 'Flag: Bouvet Island',
            '🇧🇼': 'Flag: Botswana', '🇧🇾': 'Flag: Belarus', '🇧🇿': 'Flag: Belize',
            '🇨🇦': 'Flag: Canada', '🇨🇨': 'Flag: Cocos (Keeling) Islands', '🇨🇩': 'Flag: Congo - Kinshasa',
            '🇨🇫': 'Flag: Central African Republic', '🇨🇬': 'Flag: Congo - Brazzaville', '🇨🇭': 'Flag: Switzerland',
            '🇨🇮': 'Flag: Côte d\'Ivoire', '🇨🇰': 'Flag: Cook Islands', '🇨🇱': 'Flag: Chile',
            '🇨🇲': 'Flag: Cameroon', '🇨🇳': 'Flag: China', '🇨🇴': 'Flag: Colombia',
            '🇨🇵': 'Flag: Clipperton Island', '🇨🇷': 'Flag: Costa Rica', '🇨🇺': 'Flag: Cuba',
            '🇨🇻': 'Flag: Cape Verde', '🇨🇼': 'Flag: Curaçao', '🇨🇽': 'Flag: Christmas Island',
            '🇨🇾': 'Flag: Cyprus', '🇨🇿': 'Flag: Czechia',
            '🇩🇪': 'Flag: Germany', '🇩🇬': 'Flag: Diego Garcia', '🇩🇯': 'Flag: Djibouti',
            '🇩🇰': 'Flag: Denmark', '🇩🇲': 'Flag: Dominica', '🇩🇴': 'Flag: Dominican Republic',
            '🇩🇿': 'Flag: Algeria',
            '🇪🇦': 'Flag: Ceuta & Melilla', '🇪🇨': 'Flag: Ecuador', '🇪🇪': 'Flag: Estonia',
            '🇪🇬': 'Flag: Egypt', '🇪🇭': 'Flag: Western Sahara', '🇪🇷': 'Flag: Eritrea',
            '🇪🇸': 'Flag: Spain', '🇪🇹': 'Flag: Ethiopia', '🇪🇺': 'Flag: European Union',
            '🇫🇮': 'Flag: Finland', '🇫🇯': 'Flag: Fiji', '🇫🇰': 'Flag: Falkland Islands',
            '🇫🇲': 'Flag: Micronesia', '🇫🇴': 'Flag: Faroe Islands', '🇫🇷': 'Flag: France',
            '🇬🇦': 'Flag: Gabon', '🇬🇧': 'Flag: United Kingdom', '🇬🇩': 'Flag: Grenada',
            '🇬🇪': 'Flag: Georgia', '🇬🇫': 'Flag: French Guiana', '🇬🇬': 'Flag: Guernsey',
            '🇬🇭': 'Flag: Ghana', '🇬🇮': 'Flag: Gibraltar', '🇬🇱': 'Flag: Greenland',
            '🇬🇲': 'Flag: Gambia', '🇬🇳': 'Flag: Guinea', '🇬🇵': 'Flag: Guadeloupe',
            '🇬🇶': 'Flag: Equatorial Guinea', '🇬🇷': 'Flag: Greece', '🇬🇸': 'Flag: South Georgia & South Sandwich Islands',
            '🇬🇹': 'Flag: Guatemala', '🇬🇺': 'Flag: Guam', '🇬🇼': 'Flag: Guinea-Bissau',
            '🇬🇾': 'Flag: Guyana',
            '🇭🇰': 'Flag: Hong Kong SAR China', '🇭🇲': 'Flag: Heard & McDonald Islands', '🇭🇳': 'Flag: Honduras',
            '🇭🇷': 'Flag: Croatia', '🇭🇹': 'Flag: Haiti', '🇭🇺': 'Flag: Hungary',
            '🇮🇨': 'Flag: Canary Islands', '🇮🇩': 'Flag: Indonesia', '🇮🇪': 'Flag: Ireland',
            '🇮🇱': 'Flag: Israel', '🇮🇲': 'Flag: Isle of Man', '🇮🇳': 'Flag: India',
            '🇮🇴': 'Flag: British Indian Ocean Territory', '🇮🇶': 'Flag: Iraq', '🇮🇷': 'Flag: Iran',
            '🇮🇸': 'Flag: Iceland', '🇮🇹': 'Flag: Italy',
            '🇯🇪': 'Flag: Jersey', '🇯🇲': 'Flag: Jamaica', '🇯🇴': 'Flag: Jordan',
            '🇯🇵': 'Flag: Japan',
            '🇰🇪': 'Flag: Kenya', '🇰🇬': 'Flag: Kyrgyzstan', '🇰🇭': 'Flag: Cambodia',
            '🇰🇮': 'Flag: Kiribati', '🇰🇲': 'Flag: Comoros', '🇰🇳': 'Flag: St. Kitts & Nevis',
            '🇰🇵': 'Flag: North Korea', '🇰🇷': 'Flag: South Korea', '🇰🇼': 'Flag: Kuwait',
            '🇰🇾': 'Flag: Cayman Islands', '🇰🇿': 'Flag: Kazakhstan',
            '🇱🇦': 'Flag: Laos', '🇱🇧': 'Flag: Lebanon', '🇱🇨': 'Flag: St. Lucia',
            '🇱🇮': 'Flag: Liechtenstein', '🇱🇰': 'Flag: Sri Lanka', '🇱🇷': 'Flag: Liberia',
            '🇱🇸': 'Flag: Lesotho', '🇱🇹': 'Flag: Lithuania', '🇱🇺': 'Flag: Luxembourg',
            '🇱🇻': 'Flag: Latvia', '🇱🇾': 'Flag: Libya',
            '🇲🇦': 'Flag: Morocco', '🇲🇨': 'Flag: Monaco', '🇲🇩': 'Flag: Moldova',
            '🇲🇪': 'Flag: Montenegro', '🇲🇫': 'Flag: St. Martin', '🇲🇬': 'Flag: Madagascar',
            '🇲🇭': 'Flag: Marshall Islands', '🇲🇰': 'Flag: North Macedonia', '🇲🇱': 'Flag: Mali',
            '🇲🇲': 'Flag: Myanmar (Burma)', '🇲🇳': 'Flag: Mongolia', '🇲🇴': 'Flag: Macao SAR China',
            '🇲🇵': 'Flag: Northern Mariana Islands', '🇲🇶': 'Flag: Martinique', '🇲🇷': 'Flag: Mauritania',
            '🇲🇸': 'Flag: Montserrat', '🇲🇹': 'Flag: Malta', '🇲🇺': 'Flag: Mauritius',
            '🇲🇻': 'Flag: Maldives', '🇲🇼': 'Flag: Malawi', '🇲🇽': 'Flag: Mexico',
            '🇲🇾': 'Flag: Malaysia', '🇲🇿': 'Flag: Mozambique',
            '🇳🇦': 'Flag: Namibia', '🇳🇨': 'Flag: New Caledonia', '🇳🇪': 'Flag: Niger',
            '🇳🇫': 'Flag: Norfolk Island', '🇳🇬': 'Flag: Nigeria', '🇳🇮': 'Flag: Nicaragua',
            '🇳🇱': 'Flag: Netherlands', '🇳🇴': 'Flag: Norway', '🇳🇵': 'Flag: Nepal',
            '🇳🇷': 'Flag: Nauru', '🇳🇺': 'Flag: Niue', '🇳🇿': 'Flag: New Zealand',
            '🇴🇲': 'Flag: Oman',
            '🇵🇦': 'Flag: Panama', '🇵🇪': 'Flag: Peru', '🇵🇫': 'Flag: French Polynesia',
            '🇵🇬': 'Flag: Papua New Guinea', '🇵🇭': 'Flag: Philippines', '🇵🇰': 'Flag: Pakistan',
            '🇵🇱': 'Flag: Poland', '🇵🇲': 'Flag: St. Pierre & Miquelon', '🇵🇳': 'Flag: Pitcairn Islands',
            '🇵🇷': 'Flag: Puerto Rico', '🇵🇸': 'Flag: Palestinian Territories', '🇵🇹': 'Flag: Portugal',
            '🇵🇼': 'Flag: Palau', '🇵🇾': 'Flag: Paraguay',
            '🇶🇦': 'Flag: Qatar', '🇷🇪': 'Flag: Réunion', '🇷🇴': 'Flag: Romania',
            '🇷🇸': 'Flag: Serbia', '🇷🇺': 'Flag: Russia', '🇷🇼': 'Flag: Rwanda',
            '🇸🇦': 'Flag: Saudi Arabia', '🇸🇧': 'Flag: Solomon Islands', '🇸🇨': 'Flag: Seychelles',
            '🇸🇩': 'Flag: Sudan', '🇸🇪': 'Flag: Sweden', '🇸🇬': 'Flag: Singapore',
            '🇸🇭': 'Flag: St. Helena', '🇸🇮': 'Flag: Slovenia', '🇸🇯': 'Flag: Svalbard & Jan Mayen',
            '🇸🇰': 'Flag: Slovakia', '🇸🇱': 'Flag: Sierra Leone', '🇸🇲': 'Flag: San Marino',
            '🇸🇳': 'Flag: Senegal', '🇸🇴': 'Flag: Somalia', '🇸🇷': 'Flag: Suriname',
            '🇸🇸': 'Flag: South Sudan', '🇸🇹': 'Flag: São Tomé & Príncipe', '🇸🇻': 'Flag: El Salvador',
            '🇸🇽': 'Flag: Sint Maarten', '🇸🇾': 'Flag: Syria', '🇸🇿': 'Flag: Eswatini',
            '🇹🇦': 'Flag: Tristan da Cunha', '🇹🇨': 'Flag: Turks & Caicos Islands', '🇹🇩': 'Flag: Chad',
            '🇹🇫': 'Flag: French Southern Territories', '🇹🇬': 'Flag: Togo', '🇹🇭': 'Flag: Thailand',
            '🇹🇯': 'Flag: Tajikistan', '🇹🇰': 'Flag: Tokelau', '🇹🇱': 'Flag: Timor-Leste',
            '🇹🇲': 'Flag: Turkmenistan', '🇹🇳': 'Flag: Tunisia', '🇹🇴': 'Flag: Tonga',
            '🇹🇷': 'Flag: Turkey', '🇹🇹': 'Flag: Trinidad & Tobago', '🇹🇻': 'Flag: Tuvalu',
            '🇹🇼': 'Flag: Taiwan', '🇹🇿': 'Flag: Tanzania',
            '🇺🇦': 'Flag: Ukraine', '🇺🇬': 'Flag: Uganda', '🇺🇲': 'Flag: U.S. Outlying Islands',
            '🇺🇳': 'Flag: United Nations', '🇺🇸': 'Flag: United States', '🇺🇾': 'Flag: Uruguay',
            '🇺🇿': 'Flag: Uzbekistan',
            '🇻🇦': 'Flag: Vatican City', '🇻🇨': 'Flag: St. Vincent & Grenadines', '🇻🇪': 'Flag: Venezuela',
            '🇻🇬': 'Flag: British Virgin Islands', '🇻🇮': 'Flag: U.S. Virgin Islands', '🇻🇳': 'Flag: Vietnam',
            '🇻🇺': 'Flag: Vanuatu', '🇼🇫': 'Flag: Wallis & Futuna', '🇼🇸': 'Flag: Samoa',
            '🇾🇪': 'Flag: Yemen', '🇾🇹': 'Flag: Mayotte',             '🇿🇦': 'Flag: South Africa',
            '🇿🇲': 'Flag: Zambia', '🇿🇼': 'Flag: Zimbabwe',
            
            // Regional Indicator Symbols (Flag Letter Components)
            '🇦': 'Regional Indicator Symbol Letter A', '🇧': 'Regional Indicator Symbol Letter B',
            '🇨': 'Regional Indicator Symbol Letter C', '🇩': 'Regional Indicator Symbol Letter D',
            '🇪': 'Regional Indicator Symbol Letter E', '🇫': 'Regional Indicator Symbol Letter F',
            '🇬': 'Regional Indicator Symbol Letter G', '🇭': 'Regional Indicator Symbol Letter H',
            '🇮': 'Regional Indicator Symbol Letter I', '🇯': 'Regional Indicator Symbol Letter J',
            '🇰': 'Regional Indicator Symbol Letter K', '🇱': 'Regional Indicator Symbol Letter L',
            '🇲': 'Regional Indicator Symbol Letter M', '🇳': 'Regional Indicator Symbol Letter N',
            '🇴': 'Regional Indicator Symbol Letter O', '🇵': 'Regional Indicator Symbol Letter P',
            '🇶': 'Regional Indicator Symbol Letter Q', '🇷': 'Regional Indicator Symbol Letter R',
            '🇸': 'Regional Indicator Symbol Letter S', '🇹': 'Regional Indicator Symbol Letter T',
            '🇺': 'Regional Indicator Symbol Letter U', '🇻': 'Regional Indicator Symbol Letter V',
            '🇼': 'Regional Indicator Symbol Letter W', '🇽': 'Regional Indicator Symbol Letter X',
            '🇾': 'Regional Indicator Symbol Letter Y', '🇿': 'Regional Indicator Symbol Letter Z',
            
            // Additional missing emojis
            '🚢': 'Ship', '🚤': 'Speedboat', '🛥️': 'Motor Boat', '⛵': 'Sailboat',
            '🛎️': 'Bellhop Bell', '🪝': 'Hook', '🪡': 'Sewing Needle',
            '🧵': 'Thread', '🧶': 'Yarn', '🪢': 'Knot',
            '🀄': 'Mahjong Red Dragon', '🃏': 'Joker',
            '🅰️': 'A Button (Blood Type)', '🅱️': 'B Button (Blood Type)',
            '🅾️': 'O Button (Blood Type)', '🅿️': 'P Button',
            '🆎': 'AB Button (Blood Type)', '🆑': 'CL Button',
            '🆒': 'COOL Button', '🆓': 'FREE Button', '🆔': 'ID Button',
            '🆕': 'NEW Button', '🆖': 'NG Button', '🆗': 'OK Button',
            '🆘': 'SOS Button', '🆙': 'UP! Button', '🆚': 'VS Button',
            '🈁': 'Japanese "Here" Button', '🈂️': 'Japanese "Service Charge" Button',
            '🈚': 'Japanese "Free of Charge" Button', '🈯': 'Japanese "Reserved" Button',
            '🈲': 'Japanese "Prohibited" Button', '🈳': 'Japanese "Vacancy" Button',
            '🈴': 'Japanese "Passing Grade" Button', '🈵': 'Japanese "No Vacancy" Button',
            
            // Additional emojis (non-variant versions and others)
            '🅰': 'A Button (Blood Type)',
            '🅱': 'B Button (Blood Type)',
            '🅾': 'O Button (Blood Type)',
            '🅿': 'P Button',
            '🈂': 'Japanese "Service Charge" Button',
            '🈷': 'Japanese "Monthly Amount" Button',
            '🌈': 'Rainbow',
            '🌡': 'Thermometer',
            '🌤': 'Sun Behind Small Cloud',
            '🌥': 'Sun Behind Large Cloud',
            '🌦': 'Sun Behind Rain Cloud',
            '🌧': 'Cloud With Rain',
            '🌩': 'Cloud With Lightning',
            '🌫': 'Fog',
            '🌶': 'Hot Pepper',
            '🎓': 'Graduation Cap',
            '🎖': 'Military Medal',
            '🎗': 'Reminder Ribbon',
            '🎙': 'Studio Microphone',
            '🎚': 'Level Slider',
            '🎛': 'Control Knobs',
            '🎞': 'Film Frames',
            '🎟': 'Admission Tickets',
            '🏋': 'Person Lifting Weights',
            '🏌': 'Person Golfing',
            '🏍': 'Motorcycle',
            '🏎': 'Racing Car',
            '🏔': 'Snow-Capped Mountain',
            '🏕': 'Camping',
            '🏖': 'Beach With Umbrella',
            '🏗': 'Building Construction',
            '🏘': 'Houses',
            '🏙': 'Cityscape',
            '🏚': 'Derelict House',
            '🏛': 'Classical Building',
            '🏜': 'Desert',
            '🏝': 'Desert Island',
            '🏞': 'National Park',
            '🏟': 'Stadium',
            '🏳': 'White Flag',
            '🏵': 'Rosette',
            '🏷': 'Label',
            '🐿': 'Chipmunk',
            '👁': 'Eye',
            '💼': 'Briefcase',
            '📽': 'Film Projector',
            '🔗': 'Link',
            '🕉': 'Om',
            '🕊': 'Dove of Peace',
            '🕯': 'Candle',
            '🕰': 'Mantelpiece Clock',
            '🕳': 'Hole',
            '🕴': 'Man in Business Suit Levitating',
            '🕵': 'Detective',
            '🕷': 'Spider',
            '🕹': 'Joystick',
            '🖇': 'Linked Paperclips',
            '🖐': 'Hand With Fingers Splayed',
            '🖥': 'Desktop Computer',
            '🖨': 'Printer',
            '🖱': 'Computer Mouse',
            '🖲': 'Trackball',
            '🖼': 'Framed Picture',
            '🗂': 'Card Index Dividers',
            '🗃': 'Card File Box',
            '🗄': 'File Cabinet',
            '🗑': 'Wastebasket',
            '🗒': 'Spiral Notepad',
            '🗓': 'Spiral Calendar',
            '🗜': 'Compression',
            '🗝': 'Old Key',
            '🗡': 'Dagger',
            '🗯': 'Right Anger Bubble',
            '🗳': 'Ballot Box With Ballot',
            '🗺': 'World Map',
            '🛋': 'Couch and Lamp',
            '🛍': 'Shopping Bags',
            '🛎': 'Bellhop Bell',
            '🛏': 'Bed',
            '🛠': 'Hammer and Wrench',
            '🛡': 'Shield',
            '🛢': 'Oil Drum',
            '🛣': 'Motorway',
            '🛤': 'Railway Track',
            '🛩': 'Small Airplane',
        };
        
        return emojiNames[emoji] || emoji;
    }
    
    buildEmojiKeywordMap() {
        // Generate comprehensive keyword map from emoji names
        const keywordMap = {};
        const stopWords = new Set([
            'a', 'an', 'the', 'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
            'and', 'or', 'but', 'nor', 'for', 'yet', 'so', 'at', 'by', 'in', 'of', 'on',
            'to', 'up', 'down', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
            'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both',
            'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
            'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'can', 'will',
            'just', 'don', 'should', 'now', 'from', 'with', 'about', 'against', 'between',
            'into', 'through', 'during', 'before', 'after', 'above', 'below', 'to', 'from',
            'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further',
            'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any',
            'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
            'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'can',
            'will', 'just', 'don', 'should', 'now', 'd', 'll', 'm', 'o', 're', 've', 'y',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
            'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they'
        ]);
        
        // Get all emojis from categories
        const allEmojis = Object.values(this.emojiCategories).flat();
        
        allEmojis.forEach(emoji => {
            const name = this.getEmojiName(emoji);
            if (name === emoji) return; // Skip if name is just the emoji itself
            
            // Extract keywords from name
            const words = name.toLowerCase()
                .split(/[\s\-_]+/)
                .map(word => word.replace(/[^a-z0-9]/g, ''))
                .filter(word => word.length > 1 && !stopWords.has(word));
            
            // Add individual words as keywords
            words.forEach(keyword => {
                if (keyword.length > 0) {
                    if (!keywordMap[keyword]) {
                        keywordMap[keyword] = [];
                    }
                    if (!keywordMap[keyword].includes(emoji)) {
                        keywordMap[keyword].push(emoji);
                    }
                }
            });
            
            // Add compound words (e.g., "wastebasket" -> "wastebasket")
            const compound = name.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (compound.length > 3 && compound !== name.toLowerCase().replace(/\s+/g, '')) {
                if (!keywordMap[compound]) {
                    keywordMap[compound] = [];
                }
                if (!keywordMap[compound].includes(emoji)) {
                    keywordMap[compound].push(emoji);
                }
            }
        });
        
        // Add additional manual mappings for common synonyms and search terms
        const additionalMappings = {
            // Waste/Trash
            'trash': ['🗑️'],
            'garbage': ['🗑️'],
            'waste': ['🗑️'],
            'rubbish': ['🗑️'],
            'bin': ['🗑️'],
            'dumpster': ['🗑️'],
            'wastebasket': ['🗑️'],
            
            // Broom/Cleaning
            'vacuum': ['🧹'],
            'broom': ['🧹'],
            'sweep': ['🧹'],
            'cleaning': ['🧹', '🧼'],
            'sweeper': ['🧹'],
            
            // Soap
            'soap': ['🧼'],
            'cleanser': ['🧼'],
        };
        
        // Merge additional mappings
        Object.keys(additionalMappings).forEach(keyword => {
            if (!keywordMap[keyword]) {
                keywordMap[keyword] = [];
            }
            additionalMappings[keyword].forEach(emoji => {
                if (!keywordMap[keyword].includes(emoji)) {
                    keywordMap[keyword].push(emoji);
                }
            });
        });
        
        return keywordMap;
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
        
        // Delete history modal events
        if (this.closeDeleteHistoryModalBtn) {
            this.closeDeleteHistoryModalBtn.addEventListener('click', () => this.hideDeleteHistoryModal());
        }
        if (this.cancelDeleteHistoryBtn) {
            this.cancelDeleteHistoryBtn.addEventListener('click', () => this.hideDeleteHistoryModal());
        }
        if (this.confirmDeleteHistoryBtn) {
            this.confirmDeleteHistoryBtn.addEventListener('click', () => this.confirmDeleteHistoryEntry());
        }
        if (this.deleteHistoryModal) {
            this.deleteHistoryModal.addEventListener('click', (e) => {
                if (e.target === this.deleteHistoryModal) {
                    this.hideDeleteHistoryModal();
                }
            });
        }
        
        // Group collapse/expand buttons
        document.querySelectorAll('.tasks-section-collapse-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const group = btn.dataset.group;
                this.toggleGroupCollapse(group);
            });
        });
        
        // Group add task buttons
        document.querySelectorAll('.tasks-section-add-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const group = btn.dataset.group;
                this.showAddTaskModal(null, group);
            });
        });
        
        // Group overflow buttons
        document.querySelectorAll('.tasks-section-overflow-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const group = btn.dataset.group;
                this.toggleOverflowMenu(group);
            });
        });
        
        // Overflow menu items
        document.querySelectorAll('.overflow-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const action = item.dataset.action;
                const group = item.dataset.group;
                this.handleOverflowAction(action, group);
            });
        });
        
        // Close overflow menus when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.tasks-section-overflow-container')) {
                document.querySelectorAll('.tasks-section-overflow-menu').forEach(menu => {
                    menu.classList.remove('show');
                });
            }
        });
        
        // Sidebar toggle
        if (this.sidebarToggleBtn) {
            this.sidebarToggleBtn.addEventListener('click', () => {
                this.toggleSidebar();
            });
        }
        
        if (this.taskNameInput) {
            this.taskNameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.createTaskFromModal();
                }
            });
            
            // Auto-detect emoji as user types (after each word completion)
            this.taskNameInput.addEventListener('input', (e) => {
                // Emoji picker is always enabled, no need to disable based on task name
                const taskName = this.taskNameInput.value.trim();
                
                // Auto-detect emoji as user types (after each word completion)
                // Only if emoji wasn't manually selected
                if (!this.emojiManuallySelected && taskName) {
                    // Check if user just completed a word (space, comma, period, etc.)
                    const lastChar = e.data || '';
                    const isWordComplete = lastChar === ' ' || lastChar === ',' || lastChar === '.' || 
                                         lastChar === '!' || lastChar === '?' || lastChar === ';' ||
                                         lastChar === ':' || lastChar === '\n';
                    
                    // Also check on every input to catch cases where user types quickly
                    // Use a small debounce to avoid too many checks
                    clearTimeout(this.emojiDetectionTimeout);
                    this.emojiDetectionTimeout = setTimeout(() => {
                        if (!this.emojiManuallySelected && this.taskNameInput.value.trim()) {
                            const detectedEmoji = this.getEmojiForTaskName(this.taskNameInput.value.trim());
                            this.selectEmoji(detectedEmoji, false); // false = auto-detected
                        }
                    }, 300); // 300ms debounce
                }
            });
        }
        
        // Emoji picker button click
        if (this.emojiPickerBtn) {
            this.emojiPickerBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!this.emojiPickerBtn.disabled) {
                    const isVisible = this.emojiPickerDropdown && this.emojiPickerDropdown.style.display !== 'none';
                    if (this.emojiPickerDropdown) {
                        this.emojiPickerDropdown.style.display = isVisible ? 'none' : 'block';
                        if (!isVisible) {
                            this.renderEmojiPicker();
                            // Clear search on open
                            if (this.emojiSearchInput) {
                                this.emojiSearchInput.value = '';
                            }
                        }
                    }
                }
            });
        }
        
        // Close emoji picker when clicking outside
        document.addEventListener('click', (e) => {
            if (this.emojiPickerDropdown && 
                !this.emojiPickerDropdown.contains(e.target) && 
                this.emojiPickerBtn && 
                !this.emojiPickerBtn.contains(e.target)) {
                this.emojiPickerDropdown.style.display = 'none';
            }
        });
        
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
        if (this.addTagBtn) {
            this.addTagBtn.addEventListener('click', () => this.showAddTagModal());
        }
        
        if (this.closeTagModalBtn) {
            this.closeTagModalBtn.addEventListener('click', () => this.hideAddTagModal());
        }
        
        if (this.cancelTagBtn) {
            this.cancelTagBtn.addEventListener('click', () => this.hideAddTagModal());
        }
        
        if (this.saveTagBtn) {
            this.saveTagBtn.addEventListener('click', () => this.createTagFromManagement());
        }
        
        if (this.tagNameInput) {
            this.tagNameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.createTagFromManagement();
                }
            });
        }
        
        // Close modal when clicking outside
        if (this.addTagModal) {
            this.addTagModal.addEventListener('click', (e) => {
                if (e.target === this.addTagModal) {
                    this.hideAddTagModal();
                }
            });
        }
        
        // Edit tag modal events
        if (this.closeEditTagModalBtn) {
            this.closeEditTagModalBtn.addEventListener('click', () => this.hideEditTagModal());
        }
        
        if (this.cancelEditTagBtn) {
            this.cancelEditTagBtn.addEventListener('click', () => this.hideEditTagModal());
        }
        
        if (this.saveEditTagBtn) {
            this.saveEditTagBtn.addEventListener('click', () => this.saveTagEdit());
        }
        
        if (this.editTagNameInput) {
            this.editTagNameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.saveTagEdit();
                }
            });
        }
        
        // Close edit modal when clicking outside
        if (this.editTagModal) {
            this.editTagModal.addEventListener('click', (e) => {
                if (e.target === this.editTagModal) {
                    this.hideEditTagModal();
                }
            });
        }
        
        // Modal tag creation is now handled inline via the + button in renderModalTagSelector
        
        // Initialize color picker for modal
        this.initializeModalColorPicker();
        
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
        
        // Keyboard shortcuts for undo/redo
        document.addEventListener('keydown', (e) => {
            // Check if user is typing in an input field
            const isInputFocused = e.target.tagName === 'INPUT' || 
                                  e.target.tagName === 'TEXTAREA' || 
                                  e.target.isContentEditable;
            
            // Ctrl+Z or Cmd+Z for undo
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                if (!isInputFocused || (e.target.tagName === 'INPUT' && e.target.type === 'text' && e.target.selectionStart === 0 && e.target.selectionEnd === 0)) {
                    e.preventDefault();
                    this.performUndo();
                }
            }
            
            // Ctrl+Shift+Z or Cmd+Shift+Z for redo
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') {
                if (!isInputFocused) {
                    e.preventDefault();
                    this.performRedo();
                }
            }
        });
    }
    
    showAddTaskModal(taskId = null, preSelectedGroup = null) {
        if (!this.addTaskModal) return;
        
        const task = taskId ? this.tasks.find(t => t.id === taskId) : null;
        
        // Clear or populate inputs
        if (this.taskNameInput) {
            this.taskNameInput.value = task ? task.name : '';
            // Emoji picker is always enabled
            if (this.emojiPickerBtn) {
                this.emojiPickerBtn.disabled = false;
            }
        }
        
        // Reset manual selection flag when opening modal
        this.emojiManuallySelected = false;
        
        // Store original emoji when editing (to check if it was changed)
        this.originalEmoji = null;
        
        // Set emoji if editing task, otherwise use default
        if (task && task.emoji) {
            this.selectEmoji(task.emoji, false);
            this.originalEmoji = task.emoji;
            // If task already has emoji, consider it manually set (don't auto-update)
            // But we'll only track it if the user changes it during this session
            this.emojiManuallySelected = true;
        } else {
            const taskName = this.taskNameInput ? this.taskNameInput.value.trim() : '';
            if (taskName) {
                const detectedEmoji = this.getEmojiForTaskName(taskName);
                this.selectEmoji(detectedEmoji, false);
            } else {
                this.selectEmoji('📝', false);
            }
        }
        if (this.taskDescriptionInput) {
            this.taskDescriptionInput.value = task ? (task.description || '') : '';
        }
        
        // Set status radio buttons
        if (task) {
            if (task.state === this.TASK_STATES.TODAY && this.statusTodayRadio) {
                this.statusTodayRadio.checked = true;
            } else if (task.state === this.TASK_STATES.IN_PROGRESS && this.statusInProgressRadio) {
                this.statusInProgressRadio.checked = true;
            } else if (task.state === this.TASK_STATES.COMPLETE && this.statusCompleteRadio) {
                this.statusCompleteRadio.checked = true;
            } else if (this.statusNoneRadio) {
                this.statusNoneRadio.checked = true;
            }
        } else {
            // Default to None for new tasks
            if (this.statusNoneRadio) {
                this.statusNoneRadio.checked = true;
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
            // Use preSelectedGroup if provided, otherwise default to thisWeek
            const targetGroup = preSelectedGroup || 'thisWeek';
            if (this.groupThisWeekRadio && this.groupLaterRadio) {
                if (targetGroup === 'later') {
                    this.groupLaterRadio.checked = true;
                } else {
                    this.groupThisWeekRadio.checked = true;
                }
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
            // Reset emoji picker (but keep it enabled)
            if (this.emojiPickerBtn) {
                this.emojiPickerBtn.disabled = false;
            }
            if (this.selectedEmojiDisplay) {
                this.selectedEmojiDisplay.textContent = '📝';
            }
            if (this.emojiPickerDropdown) {
                this.emojiPickerDropdown.style.display = 'none';
            }
            // Reset manual selection flag
            this.emojiManuallySelected = false;
            // Clear original emoji
            this.originalEmoji = null;
            // Clear any pending emoji detection timeout
            if (this.emojiDetectionTimeout) {
                clearTimeout(this.emojiDetectionTimeout);
            }
        }
    }
    
    renderModalTagSelector(task = null) {
        if (!this.taskTagsSelector) return;
        
        this.taskTagsSelector.innerHTML = '';
        
        const taskTags = task && task.tags ? task.tags : [];
        
        this.allTags.forEach(tag => {
            const isChecked = taskTags.includes(tag.name);
            
            const tagItem = document.createElement('label');
            tagItem.className = 'modal-tag-checkbox-item';
            if (isChecked) {
                tagItem.classList.add('checked');
            }
            
            const tagSpan = document.createElement('span');
            tagSpan.className = 'modal-tag-label';
            const transparentBg = this.hexToRgba(tag.color, 0.15);
            tagSpan.style.cssText = `background: ${transparentBg}; color: ${tag.color}; border: 1px solid ${tag.color};`;
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = tag.name;
            checkbox.checked = isChecked;
            
            const tagText = document.createElement('span');
            tagText.className = 'modal-tag-text';
            tagText.textContent = tag.name;
            
            tagSpan.appendChild(checkbox);
            tagSpan.appendChild(tagText);
            
            tagItem.appendChild(tagSpan);
            
            // Update checked class when checkbox changes
            checkbox.addEventListener('change', () => {
                tagItem.classList.toggle('checked', checkbox.checked);
            });
            
            // Make the entire tag clickable - clicking anywhere on the tag toggles the checkbox
            tagItem.addEventListener('click', (e) => {
                // If clicking directly on checkbox, let it handle naturally (change event will update class)
                if (e.target === checkbox) {
                    return;
                }
                // Otherwise, prevent default and manually toggle
                e.preventDefault();
                checkbox.checked = !checkbox.checked;
                // Dispatch change event to update the class
                checkbox.dispatchEvent(new Event('change'));
            });
            
            this.taskTagsSelector.appendChild(tagItem);
        });
        
        // Add + button inline with tags
        const addTagButton = document.createElement('button');
        addTagButton.type = 'button';
        addTagButton.className = 'modal-add-tag-inline-btn';
        addTagButton.textContent = '+';
        addTagButton.addEventListener('click', () => this.createTagFromModal());
        this.taskTagsSelector.appendChild(addTagButton);
    }
    
    createTagFromModal() {
        const tagName = prompt('Enter tag name:');
        if (!tagName) return;
        
        const trimmedTagName = tagName.trim();
        if (!trimmedTagName) return;
        
        // Check if tag already exists (case-insensitive)
        if (this.findTagByNameCaseInsensitive(trimmedTagName)) {
            this.showNotification('Tag already exists!');
            return;
        }
        
        // Create tag with random color (preserve case)
        const randomColor = this.tagColors[Math.floor(Math.random() * this.tagColors.length)];
        const newTag = {
            name: trimmedTagName,
            color: randomColor.value
        };
        this.allTags.push(newTag);
        
        // Refresh tag selector
        const currentTask = this.currentEditingTaskId ? this.tasks.find(t => t.id === this.currentEditingTaskId) : null;
        this.renderModalTagSelector(currentTask);
        this.saveToLocalStorage();
        this.showNotification('Tag created!');
    }
    
    createTaskFromModal() {
        if (!this.taskNameInput) return;
        
        const taskName = this.taskNameInput.value.trim();
        if (!taskName) return;
        
        const description = this.taskDescriptionInput ? this.taskDescriptionInput.value.trim() : '';
        
        // Get selected status from radio buttons
        let selectedState = this.TASK_STATES.NONE;
        if (this.statusTodayRadio && this.statusTodayRadio.checked) {
            selectedState = this.TASK_STATES.TODAY;
        } else if (this.statusInProgressRadio && this.statusInProgressRadio.checked) {
            selectedState = this.TASK_STATES.IN_PROGRESS;
        } else if (this.statusCompleteRadio && this.statusCompleteRadio.checked) {
            selectedState = this.TASK_STATES.COMPLETE;
        }
        
        // If emoji wasn't manually selected, auto-detect it now
        let emoji;
        if (this.emojiManuallySelected) {
            emoji = this.getSelectedEmoji();
            // Track this emoji as recently used only if:
            // 1. It's a new task (not editing), OR
            // 2. It's being edited and the emoji was changed from the original
            const emojiWasChanged = this.currentEditingTaskId && this.originalEmoji && emoji !== this.originalEmoji;
            if (!this.currentEditingTaskId || emojiWasChanged) {
                this.addToRecentEmojis(emoji);
            }
        } else {
            emoji = this.getEmojiForTaskName(taskName);
            this.selectEmoji(emoji, false);
        }
        
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
                task.emoji = emoji;
                task.state = selectedState;
                // Mark as completed if status is complete
                task.isCompleted = selectedState === this.TASK_STATES.COMPLETE;
                // Update group
                if (this.groupThisWeekRadio && this.groupLaterRadio) {
                    task.group = this.groupThisWeekRadio.checked ? 'thisWeek' : 'later';
                }
            }
        } else {
            // Create new task
            const group = (this.groupThisWeekRadio && this.groupThisWeekRadio.checked) ? 'thisWeek' : 'later';
            const tasksInGroup = this.tasks.filter(t => (t.group || 'thisWeek') === group);
            const maxOrderIndex = tasksInGroup.reduce((max, t) => 
                Math.max(max, t.orderIndex !== undefined ? t.orderIndex : -1), -1);
            
            const task = {
                id: Date.now(),
                name: taskName,
                description: description,
                emoji: emoji,
                timeSpent: 0,
                isRunning: false,
                isCompleted: selectedState === this.TASK_STATES.COMPLETE,
                startTime: null,
                endTime: null,
                state: selectedState,
                sessions: [],
                tags: selectedTags,
                group: group,
                orderIndex: maxOrderIndex + 1
            };
            
            this.tasks.push(task);
            
            // Log history if task is added to Today
            if (selectedState === this.TASK_STATES.TODAY) {
                this.addHistoryEntry(task.id, taskName, 'Task added to Today');
            }
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
                task.tags && task.tags.some(t => t.toLowerCase() === this.selectedTagFilter.toLowerCase())
            );
        }
        
        if (isTasksView) {
            this.renderTasksTable(filteredTasks);
        } else if (isKanbanView) {
            this.renderKanbanBoard(filteredTasks);
        }
    }
    
    renderTasksTable(tasks) {
        if (!this.thisWeekTasksBody || !this.laterTasksBody || !this.completedTasksBody) return;
        
        // Ensure all tasks have a group (default to thisWeek)
        tasks.forEach(task => {
            if (!task.group) {
                task.group = 'thisWeek';
            }
        });
        
        // Separate completed and non-completed tasks
        const allCompletedTasks = tasks.filter(task => 
            task.isCompleted || task.state === this.TASK_STATES.COMPLETE
        );
        
        // Filter out completed tasks from regular groups
        let nonCompletedTasks = tasks.filter(task => 
            !(task.isCompleted || task.state === this.TASK_STATES.COMPLETE)
        );
        
        // Split non-completed tasks by group
        let thisWeekTasks = nonCompletedTasks.filter(task => 
            (!task.group || task.group === 'thisWeek')
        );
        let laterTasks = nonCompletedTasks.filter(task => 
            task.group === 'later'
        );
        
        // Sort tasks: use orderIndex for non-completed tasks
        const sortTasks = (taskList) => {
            return taskList.sort((a, b) => {
                const aOrder = a.orderIndex !== undefined ? a.orderIndex : 9999;
                const bOrder = b.orderIndex !== undefined ? b.orderIndex : 9999;
                
                // If both have orderIndex set (manually reordered), use that
                if (a.orderIndex !== undefined && b.orderIndex !== undefined) {
                    return aOrder - bOrder;
                }
                
                // If only one has orderIndex, prioritize it
                if (a.orderIndex !== undefined && b.orderIndex === undefined) return -1;
                if (a.orderIndex === undefined && b.orderIndex !== undefined) return 1;
                
                // Neither has orderIndex, use uncheckedAt logic for newly unchecked tasks
                const aUncheckedTime = a.uncheckedAt || 0;
                const bUncheckedTime = b.uncheckedAt || 0;
                // If one has uncheckedAt and other doesn't, put the one with uncheckedAt at bottom
                if (aUncheckedTime > 0 && bUncheckedTime === 0) return 1;
                if (aUncheckedTime === 0 && bUncheckedTime > 0) return -1;
                // If both have uncheckedAt, later unchecked goes to bottom
                if (aUncheckedTime > 0 && bUncheckedTime > 0) {
                    return aUncheckedTime - bUncheckedTime;
                }
                
                // Fallback to orderIndex (which might be 9999 for both)
                return aOrder - bOrder;
            });
        };
        
        // Sort completed tasks by completion time DESCENDING (most recent first)
        const sortCompletedTasks = (taskList) => {
            return taskList.sort((a, b) => {
                const aTime = a.completedAt || 0;
                const bTime = b.completedAt || 0;
                return bTime - aTime; // Later completion comes first
            });
        };
        
        thisWeekTasks = sortTasks(thisWeekTasks);
        laterTasks = sortTasks(laterTasks);
        const completedTasks = sortCompletedTasks(allCompletedTasks);
        
        // Clear all tables
        this.thisWeekTasksBody.innerHTML = '';
        this.laterTasksBody.innerHTML = '';
        this.completedTasksBody.innerHTML = '';
        
        // Render This Week tasks
        thisWeekTasks.forEach(task => {
            this.renderTaskRow(task, this.thisWeekTasksBody);
        });
        
        // Render Later tasks
        laterTasks.forEach(task => {
            this.renderTaskRow(task, this.laterTasksBody);
        });
        
        // Render Completed tasks
        completedTasks.forEach(task => {
            this.renderTaskRow(task, this.completedTasksBody);
        });
        
        // Hide/show table containers based on whether they have tasks
        const thisWeekContainer = document.querySelector('.tasks-table-container[data-group="thisWeek"]');
        const laterContainer = document.querySelector('.tasks-table-container[data-group="later"]');
        const completedContainer = document.querySelector('.tasks-table-container[data-group="completed"]');
        
        if (thisWeekContainer) {
            if (thisWeekTasks.length === 0) {
                thisWeekContainer.classList.add('empty');
            } else {
                thisWeekContainer.classList.remove('empty');
            }
        }
        if (laterContainer) {
            if (laterTasks.length === 0) {
                laterContainer.classList.add('empty');
            } else {
                laterContainer.classList.remove('empty');
            }
        }
        if (completedContainer) {
            if (completedTasks.length === 0) {
                completedContainer.classList.add('empty');
            } else {
                completedContainer.classList.remove('empty');
            }
        }
        
        // Update task counts
        this.updateGroupCounts({
            thisWeek: thisWeekTasks.length,
            later: laterTasks.length,
            completed: completedTasks.length
        });
        
        // Setup drag and drop for task rows
        this.setupTaskTableDragAndDrop();
    }
    
    renderTaskRow(task, tbody) {
        const row = document.createElement('tr');
        row.className = 'task-row';
        row.dataset.taskId = task.id;
        row.dataset.taskGroup = task.group || 'thisWeek';
        
        const isCompleted = task.isCompleted || task.state === this.TASK_STATES.COMPLETE;
        
        // Only allow dragging for non-completed tasks
        row.draggable = !isCompleted;
        
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
        const nameContainer = document.createElement('div');
        nameContainer.style.display = 'flex';
        nameContainer.style.alignItems = 'center';
        nameContainer.style.gap = '10px';
        
        // Emoji circle
        if (task.emoji) {
            const emojiCircle = document.createElement('div');
            emojiCircle.className = 'task-emoji-circle';
            const tagColor = task.tags && task.tags.length > 0 ? this.getTagColor(task.tags[0]) : this.tagColors[0].value;
            emojiCircle.style.backgroundColor = this.hexToRgba(tagColor, 0.15);
            emojiCircle.textContent = task.emoji;
            nameContainer.appendChild(emojiCircle);
        }
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'task-name-clickable';
        nameSpan.textContent = task.name;
        if (isCompleted) {
            nameSpan.style.textDecoration = 'line-through';
            nameSpan.style.opacity = '0.6';
        }
        nameSpan.addEventListener('click', () => this.editTaskFromTable(task.id));
        nameContainer.appendChild(nameSpan);
        nameCell.appendChild(nameContainer);
        
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
            const plusIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            plusIcon.setAttribute('width', '16');
            plusIcon.setAttribute('height', '16');
            plusIcon.setAttribute('viewBox', '0 0 24 24');
            plusIcon.setAttribute('fill', 'none');
            plusIcon.setAttribute('stroke', 'currentColor');
            plusIcon.setAttribute('stroke-width', '2');
            plusIcon.setAttribute('stroke-linecap', 'round');
            plusIcon.setAttribute('stroke-linejoin', 'round');
            const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line1.setAttribute('x1', '12');
            line1.setAttribute('y1', '5');
            line1.setAttribute('x2', '12');
            line1.setAttribute('y2', '19');
            const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line2.setAttribute('x1', '5');
            line2.setAttribute('y1', '12');
            line2.setAttribute('x2', '19');
            line2.setAttribute('y2', '12');
            plusIcon.appendChild(line1);
            plusIcon.appendChild(line2);
            addToBoardBtn.appendChild(plusIcon);
            addToBoardBtn.appendChild(document.createTextNode(' Add to Board'));
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
        
        // Append all cells (no description column)
        row.appendChild(checkboxCell);
        row.appendChild(nameCell);
        row.appendChild(tagsCell);
        row.appendChild(statusCell);
        row.appendChild(deleteCell);
        
        tbody.appendChild(row);
    }
    
    setupTaskTableDragAndDrop() {
        const taskRows = document.querySelectorAll('.task-row');
        
        // Set up drag handlers for each row
        taskRows.forEach(row => {
            // Only set up drag handlers for draggable rows (non-completed tasks)
            if (row.draggable) {
                row.addEventListener('dragstart', (e) => {
                    // Double-check that task is not completed
                    const taskId = parseInt(row.dataset.taskId);
                    const task = this.tasks.find(t => t.id === taskId);
                    if (task && (task.isCompleted || task.state === this.TASK_STATES.COMPLETE)) {
                        e.preventDefault();
                        return;
                    }
                    
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
            }
        });
        
        // Set up tbody listeners for drop zones (only for non-completed groups)
        [this.thisWeekTasksBody, this.laterTasksBody].forEach(tbody => {
            if (!tbody) return;
            
            // Use a flag to avoid duplicate listeners - remove old handler if exists
            if (tbody._dropHandler) {
                tbody.removeEventListener('drop', tbody._dropHandler);
                tbody.removeEventListener('dragover', tbody._dragoverHandler);
                tbody.removeEventListener('dragleave', tbody._dragleaveHandler);
            }
            
            // Create handlers
            tbody._dragoverHandler = (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                
                const dragging = document.querySelector('.task-row.dragging');
                if (!dragging) return;
                
                // Make sure dragging task is not completed
                const draggingTaskId = parseInt(dragging.dataset.taskId);
                const draggingTask = this.tasks.find(t => t.id === draggingTaskId);
                if (draggingTask && (draggingTask.isCompleted || draggingTask.state === this.TASK_STATES.COMPLETE)) {
                    return;
                }
                
                tbody.classList.add('drag-over');
                
                const dropInfo = this.getDragAfterRow(tbody, e.clientY);
                if (!dropInfo) {
                    // No valid drop target, append to end
                    tbody.appendChild(dragging);
                } else if (dropInfo.insertBefore) {
                    // Insert before the target element
                    tbody.insertBefore(dragging, dropInfo.element);
                } else {
                    // Insert after the target element
                    if (dropInfo.element.nextSibling) {
                        tbody.insertBefore(dragging, dropInfo.element.nextSibling);
                    } else {
                        tbody.appendChild(dragging);
                    }
                }
            };
            
            tbody._dragleaveHandler = (e) => {
                if (!tbody.contains(e.relatedTarget)) {
                    tbody.classList.remove('drag-over');
                }
            };
            
            tbody._dropHandler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                tbody.classList.remove('drag-over');
                
                const taskId = parseInt(e.dataTransfer.getData('text/plain'));
                if (!taskId || isNaN(taskId)) {
                    return;
                }
                
                const draggedTask = this.tasks.find(t => t.id === taskId);
                if (!draggedTask) {
                    return;
                }
                
                if (draggedTask.isCompleted || draggedTask.state === this.TASK_STATES.COMPLETE) {
                    return;
                }
                
                // Determine new group based on tbody
                const newGroup = tbody === this.thisWeekTasksBody ? 'thisWeek' : 'later';
                
                // Remove dragging class
                const draggedRow = tbody.querySelector(`tr[data-task-id="${taskId}"]`);
                if (draggedRow) {
                    draggedRow.classList.remove('dragging');
                }
                
                // Get ALL rows in current DOM order (the dragged row should already be in its new position)
                const rows = Array.from(tbody.querySelectorAll('.task-row'));
                
                // Build new order from DOM rows - only include non-completed tasks
                // We need to preserve the exact order they appear in the DOM, skipping completed ones
                const newOrder = [];
                rows.forEach((row) => {
                    const id = parseInt(row.dataset.taskId);
                    if (isNaN(id)) return;
                    
                    const t = this.tasks.find(task => task.id === id);
                    if (t) {
                        // Update group for the dragged task
                        if (t.id === taskId) {
                            t.group = newGroup;
                        }
                        
                        // Only include non-completed tasks in the order
                        if (!(t.isCompleted || t.state === this.TASK_STATES.COMPLETE)) {
                            // Update group if this task belongs to this tbody
                            const currentGroup = t.group || 'thisWeek';
                            if (currentGroup === newGroup || t.id === taskId) {
                                t.group = newGroup;
                                newOrder.push(id);
                            }
                        }
                    }
                });
                
                if (newOrder.length > 0) {
                    // Update orderIndex for all tasks in the new order
                    this.reorderTasksInGroup(newGroup, newOrder);
                    this.saveToLocalStorage();
                    
                    // Use setTimeout to ensure DOM has settled before re-rendering
                    setTimeout(() => {
                        this.renderTasks();
                    }, 0);
                }
            };
            
            // Attach listeners
            tbody.addEventListener('dragover', tbody._dragoverHandler);
            tbody.addEventListener('dragleave', tbody._dragleaveHandler);
            tbody.addEventListener('drop', tbody._dropHandler);
        });
    }
    
    toggleGroupCollapse(group) {
        const container = document.querySelector(`.tasks-table-container[data-group="${group}"]`);
        const btn = document.querySelector(`.tasks-section-collapse-btn[data-group="${group}"]`);
        if (container && btn) {
            container.classList.toggle('collapsed');
            btn.classList.toggle('collapsed');
        }
    }
    
    toggleOverflowMenu(group) {
        const menu = document.querySelector(`.tasks-section-overflow-menu[data-group="${group}"]`);
        if (menu) {
            // Close all other menus first
            document.querySelectorAll('.tasks-section-overflow-menu').forEach(m => {
                if (m !== menu) {
                    m.classList.remove('show');
                }
            });
            menu.classList.toggle('show');
        }
    }
    
    toggleSidebar() {
        if (this.sidebar) {
            this.sidebar.classList.toggle('expanded');
            // Save state to localStorage
            const isExpanded = this.sidebar.classList.contains('expanded');
            localStorage.setItem('sidebar_expanded', isExpanded ? 'true' : 'false');
            // Update icon based on state
            this.updateSidebarIcon();
        }
    }
    
    updateSidebarIcon() {
        if (this.sidebarToggleIcon && this.sidebar) {
            const isExpanded = this.sidebar.classList.contains('expanded');
            if (isExpanded) {
                // When expanded, show close icon (to collapse)
                this.sidebarToggleIcon.textContent = 'left_panel_close';
            } else {
                // When collapsed, show open icon (to expand)
                this.sidebarToggleIcon.textContent = 'left_panel_open';
            }
        }
    }
    
    handleOverflowAction(action, group) {
        this.toggleOverflowMenu(group); // Close menu
        
        if (action === 'rename') {
            this.renameGroup(group);
        } else if (action === 'delete-group') {
            if (group === 'completed') {
                // Can't delete completed group
                return;
            }
            if (confirm(`Are you sure you want to delete the "${this.getGroupName(group)}" group? All tasks in this group will be moved to "This Week".`)) {
                this.deleteGroup(group);
            }
        } else if (action === 'delete-all') {
            if (confirm(`Are you sure you want to delete all tasks in "${this.getGroupName(group)}"? This action cannot be undone.`)) {
                this.deleteAllTasksInGroup(group);
            }
        }
    }
    
    getGroupName(group) {
        const titleElement = document.querySelector(`.tasks-section-title[data-group="${group}"]`);
        return titleElement ? titleElement.textContent : group;
    }
    
    renameGroup(group) {
        if (group === 'completed') {
            // Can't rename completed group
            return;
        }
        const titleElement = document.querySelector(`.tasks-section-title[data-group="${group}"]`);
        if (!titleElement) return;
        
        const currentName = titleElement.textContent;
        const newName = prompt('Enter new group name:', currentName);
        if (newName && newName.trim() && newName.trim() !== currentName) {
            titleElement.textContent = newName.trim();
            // Store custom group names in localStorage
            this.saveGroupNames();
        }
    }
    
    deleteGroup(group) {
        if (group === 'completed') return;
        
        // Move all tasks from this group to thisWeek
        this.tasks.forEach(task => {
            if (task.group === group) {
                task.group = 'thisWeek';
            }
        });
        
        this.saveToLocalStorage();
        this.renderTasks();
    }
    
    deleteAllTasksInGroup(group) {
        const tasksToDelete = this.tasks.filter(task => {
            if (group === 'completed') {
                return task.isCompleted || task.state === this.TASK_STATES.COMPLETE;
            } else {
                return task.group === group;
            }
        });
        
        const count = tasksToDelete.length;
        const groupName = this.getGroupName(group);
        
        tasksToDelete.forEach(task => {
            this.deleteTask(task.id, false); // false = don't show snackbar for each
        });
        
        this.renderTasks();
        
        // Show a single snackbar for bulk deletion
        if (count > 0) {
            this.showSnackbar(`Deleted ${count} task${count > 1 ? 's' : ''} from ${groupName}`);
        }
    }
    
    updateGroupCounts(counts) {
        Object.keys(counts).forEach(group => {
            const countElement = document.querySelector(`.tasks-section-count[data-group="${group}"]`);
            if (countElement) {
                countElement.textContent = counts[group];
            }
        });
    }
    
    saveGroupNames() {
        const groupNames = {};
        document.querySelectorAll('.tasks-section-title[data-group]').forEach(title => {
            const group = title.dataset.group;
            if (group !== 'completed') {
                groupNames[group] = title.textContent;
            }
        });
        localStorage.setItem('pomodoro_group_names', JSON.stringify(groupNames));
    }
    
    loadGroupNames() {
        try {
            const saved = localStorage.getItem('pomodoro_group_names');
            if (saved) {
                const groupNames = JSON.parse(saved);
                Object.keys(groupNames).forEach(group => {
                    const titleElement = document.querySelector(`.tasks-section-title[data-group="${group}"]`);
                    if (titleElement) {
                        titleElement.textContent = groupNames[group];
                    }
                });
            }
        } catch (e) {
            console.error('Error loading group names:', e);
        }
    }
    
    getDragAfterRow(tbody, y) {
        // Only consider non-completed tasks as valid drop targets
        const draggableElements = [...tbody.querySelectorAll('.task-row:not(.dragging)')].filter(row => {
            const taskId = parseInt(row.dataset.taskId);
            const task = this.tasks.find(t => t.id === taskId);
            return task && !(task.isCompleted || task.state === this.TASK_STATES.COMPLETE);
        });
        
        if (draggableElements.length === 0) {
            return null;
        }
        
        // Find the element closest to the cursor position
        const result = draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const boxCenter = box.top + box.height / 2;
            const distance = Math.abs(y - boxCenter);
            
            // If this element is closer than the current closest, use it
            if (distance < closest.distance) {
                return {
                    distance: distance,
                    element: child,
                    insertBefore: y < boxCenter // Insert before if cursor is above center
                };
            }
            
            return closest;
        }, { distance: Infinity, element: null, insertBefore: true });
        
        return result.element ? result : null;
    }
    
    reorderTasksInGroup(group, newOrder) {
        // Get all tasks in this group BEFORE we modify anything
        const tasksInGroup = this.tasks.filter(task => 
            (task.group || 'thisWeek') === group
        );
        
        // Separate completed and undone tasks
        const undoneTasks = tasksInGroup.filter(task => 
            !(task.isCompleted || task.state === this.TASK_STATES.COMPLETE)
        );
        const completedTasks = tasksInGroup.filter(task => 
            task.isCompleted || task.state === this.TASK_STATES.COMPLETE
        );
        
        // For undone tasks: Update orderIndex based on newOrder (manually reordered)
        // The newOrder contains ONLY undone tasks in their new manual order
        const orderedTaskIds = new Set(newOrder);
        newOrder.forEach((id, index) => {
            const task = undoneTasks.find(t => t.id === id);
            if (task) {
                task.orderIndex = index;
                task.uncheckedAt = null; // Clear uncheckedAt so manual order takes precedence
                task.group = group; // Ensure group is set
            }
        });
        
        // For undone tasks NOT in newOrder (shouldn't happen, but handle it)
        undoneTasks.forEach(task => {
            if (!orderedTaskIds.has(task.id)) {
                // Keep existing orderIndex or set a high value to keep them at end
                if (task.orderIndex === undefined || task.orderIndex === null) {
                    task.orderIndex = 9999;
                }
            }
        });
        
        // Build final reordered list: manually ordered undone tasks + completed tasks
        const reorderedTasks = [];
        
        // Add undone tasks in the manual order (newOrder)
        newOrder.forEach(id => {
            const task = undoneTasks.find(t => t.id === id);
            if (task) {
                reorderedTasks.push(task);
            }
        });
        
        // Add any other undone tasks that weren't in newOrder (shouldn't happen)
        undoneTasks.forEach(task => {
            if (!orderedTaskIds.has(task.id)) {
                reorderedTasks.push(task);
            }
        });
        
        // Add completed tasks (they maintain their own order from sorting)
        reorderedTasks.push(...completedTasks);
        
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
        
        // Find the current row element
        const currentRow = document.querySelector(`tr[data-task-id="${taskId}"]`);
        
        // Preserve original group when completing (so we can restore it when uncompleting)
        const wasCompleted = task.isCompleted || task.state === this.TASK_STATES.COMPLETE;
        if (!wasCompleted && !task.originalGroup) {
            // Store original group before completing
            task.originalGroup = task.group || 'thisWeek';
        }
        
        // Toggle completion
        task.isCompleted = !task.isCompleted;
        
        // Track completion/uncheck time
        if (task.isCompleted) {
            task.completedAt = Date.now();
            task.uncheckedAt = null; // Clear unchecked time
            task.state = this.TASK_STATES.COMPLETE;
            // Log history for completion
            this.addHistoryEntry(task.id, task.name, 'Task completed');
        } else {
            task.completedAt = null;
            task.uncheckedAt = Date.now(); // Track when unchecked
            if (task.state === this.TASK_STATES.COMPLETE) {
                task.state = this.TASK_STATES.NONE;
            }
            // Restore original group when uncompleting
            if (task.originalGroup) {
                task.group = task.originalGroup;
                task.originalGroup = null; // Clear the stored original group
            }
        }
        
        // If task is running, pause it
        if (task.isRunning) {
            this.pauseTask(taskId);
        }
        
        // Save and re-render (this will move completed tasks to Completed group and uncompleted back to original group)
        this.saveToLocalStorage();
        this.renderTasks();
        this.renderFilterTabs();
        this.renderKanbanFilterTabs();
        
        // Trigger pulse animation after render if task was just completed
        if (task.isCompleted && !wasCompleted) {
            // Small delay to ensure DOM is updated
            setTimeout(() => {
                this.pulseCompletedTable();
            }, 50);
        }
    }
    
    pulseCompletedTable() {
        const completedTableContainer = document.querySelector('.tasks-table-container[data-group="completed"]');
        if (!completedTableContainer) return;
        
        // Remove any existing pulse class
        completedTableContainer.classList.remove('pulse');
        
        // Force reflow to restart animation
        void completedTableContainer.offsetWidth;
        
        // Add pulse class to trigger animation
        completedTableContainer.classList.add('pulse');
        
        // Remove class after animation completes
        setTimeout(() => {
            completedTableContainer.classList.remove('pulse');
        }, 600);
    }
    
    updateTaskRowContent(row, task) {
        const isCompleted = task.isCompleted || task.state === this.TASK_STATES.COMPLETE;
        
        // Update checkbox
        const checkbox = row.querySelector('.table-checkbox');
        if (checkbox) {
            checkbox.checked = isCompleted;
        }
        
        // Update task name styling
        const nameSpan = row.querySelector('.task-name-clickable');
        if (nameSpan) {
            if (isCompleted) {
                nameSpan.style.textDecoration = 'line-through';
                nameSpan.style.opacity = '0.6';
            } else {
                nameSpan.style.textDecoration = 'none';
                nameSpan.style.opacity = '1';
            }
        }
        
        // Update status cell if needed
        const statusCell = row.querySelector('.status-col');
        if (statusCell) {
            statusCell.innerHTML = '';
            if (!task.state || task.state === this.TASK_STATES.NONE) {
                const addToBoardBtn = document.createElement('button');
                addToBoardBtn.className = 'table-action-btn primary';
                const plusIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                plusIcon.setAttribute('width', '16');
                plusIcon.setAttribute('height', '16');
                plusIcon.setAttribute('viewBox', '0 0 24 24');
                plusIcon.setAttribute('fill', 'none');
                plusIcon.setAttribute('stroke', 'currentColor');
                plusIcon.setAttribute('stroke-width', '2');
                plusIcon.setAttribute('stroke-linecap', 'round');
                plusIcon.setAttribute('stroke-linejoin', 'round');
                const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line1.setAttribute('x1', '12');
                line1.setAttribute('y1', '5');
                line1.setAttribute('x2', '12');
                line1.setAttribute('y2', '19');
                const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line2.setAttribute('x1', '5');
                line2.setAttribute('y1', '12');
                line2.setAttribute('x2', '19');
                line2.setAttribute('y2', '12');
                plusIcon.appendChild(line1);
                plusIcon.appendChild(line2);
                addToBoardBtn.appendChild(plusIcon);
                addToBoardBtn.appendChild(document.createTextNode(' Add to Board'));
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
        }
    }
    
    moveTaskToBoard(taskId) {
        // Use moveTask to ensure proper saving and history logging
        this.moveTask(taskId, this.TASK_STATES.TODAY);
    }
    
    renderTaskColumn(tasks, container, columnState) {
        // Check if there are no tasks and render empty state
        if (tasks.length === 0) {
            const emptyStateElement = document.createElement('div');
            emptyStateElement.className = 'kanban-empty-state';
            
            let emptyMessage = '';
            let emptyIcon = '';
            
            if (columnState === this.TASK_STATES.TODAY) {
                emptyMessage = 'No tasks for today';
                emptyIcon = '📅';
            } else if (columnState === this.TASK_STATES.IN_PROGRESS) {
                emptyMessage = 'No tasks in progress';
                emptyIcon = '⚡';
            } else if (columnState === this.TASK_STATES.COMPLETE) {
                emptyMessage = 'No completed tasks yet';
                emptyIcon = '✅';
            }
            
            emptyStateElement.innerHTML = `
                <div class="empty-state-icon">${emptyIcon}</div>
                <div class="empty-state-text">${emptyMessage}</div>
            `;
            container.appendChild(emptyStateElement);
            return;
        }
        
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
                                <div class="today-card-title ${task.isCompleted ? 'completed' : ''}" style="display: flex; align-items: center; gap: 8px;">
                                    ${this.renderTaskEmojiCircle(task)}
                                    <span>${task.name}</span>
                                </div>
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
                                 onclick="taskTimer.startEditTask(${task.id})" title="Click to edit" style="display: flex; align-items: center; gap: 8px;">
                                 ${this.renderTaskEmojiCircle(task)}
                                 <span>${task.name}</span>
                            </div>
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
                            <div class="task-name ${task.isCompleted ? 'completed' : ''}" style="display: flex; align-items: center; gap: 8px;">
                                 ${this.renderTaskEmojiCircle(task)}
                                 <span>${task.name}</span>
                            </div>
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
        
        const oldState = task.state;
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
        
        // Log history for state changes
        if (oldState !== newState) {
            if (newState === this.TASK_STATES.TODAY) {
                this.addHistoryEntry(taskId, task.name, 'Task added to Today');
            } else if (newState === this.TASK_STATES.IN_PROGRESS) {
                this.addHistoryEntry(taskId, task.name, 'Task moved to In Progress');
            } else if (newState === this.TASK_STATES.COMPLETE) {
                this.addHistoryEntry(taskId, task.name, 'Task completed');
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
            // Log history
            this.addHistoryEntry(taskId, task.name, 'Task completed');
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
    
    deleteTask(taskId, showSnackbar = true) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;
        
        // Store task data for undo (deep copy)
        const taskCopy = JSON.parse(JSON.stringify(task));
        
        // Remove task
        this.tasks = this.tasks.filter(t => t.id !== taskId);
        if (this.currentRunningTask === taskId) {
            this.currentRunningTask = null;
            this.stopTimer();
        }
        
        // Add to undo history
        this.addToUndoHistory({
            type: 'delete',
            task: taskCopy,
            undo: () => {
                // Restore task
                this.tasks.push(taskCopy);
                this.saveToLocalStorage();
                this.renderTasks();
                this.renderFilterTabs();
            }
        });
        
        this.saveToLocalStorage();
        this.renderTasks();
        this.renderFilterTabs();
        
        // Show snackbar with undo only if requested
        if (showSnackbar) {
            this.showSnackbar(`Deleted task: ${task.name}`, () => {
                this.performUndo();
            });
        }
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
    
    showSnackbar(message, onUndo, duration = 5000) {
        // Remove existing snackbar if any
        const existingSnackbar = document.querySelector('.snackbar');
        if (existingSnackbar) {
            existingSnackbar.remove();
        }
        
        // Clear any pending timeout and interval
        if (this.snackbarTimeoutId) {
            clearTimeout(this.snackbarTimeoutId);
            this.snackbarTimeoutId = null;
        }
        if (this.snackbarProgressInterval) {
            clearInterval(this.snackbarProgressInterval);
            this.snackbarProgressInterval = null;
        }
        
        // Create snackbar element
        const snackbar = document.createElement('div');
        snackbar.className = 'snackbar';
        
        // Store undo action
        this.pendingUndoAction = onUndo;
        
        const undoButton = onUndo ? '<button class="snackbar-undo">Undo</button>' : '';
        const closeButton = '<button class="snackbar-close" aria-label="Close">×</button>';
        
        snackbar.innerHTML = `
            <div class="snackbar-progress"></div>
            <div class="snackbar-content">
                <span class="snackbar-message">${message}</span>
                <div class="snackbar-actions">
                    ${undoButton}
                    ${closeButton}
                </div>
            </div>
        `;
        
        document.body.appendChild(snackbar);
        
        const progressBar = snackbar.querySelector('.snackbar-progress');
        
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
        
        // Setup close button handler
        const closeBtn = snackbar.querySelector('.snackbar-close');
        if (closeBtn) {
            closeBtn.onclick = () => {
                this.hideSnackbar();
            };
        }
        
        // Show snackbar
        setTimeout(() => {
            snackbar.classList.add('show');
            // Start progress bar animation - start full and animate to empty
            progressBar.style.transform = 'scaleX(1)';
            progressBar.style.transition = `transform ${duration}ms linear`;
            // Trigger animation after a small delay to ensure transition is applied
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    progressBar.style.transform = 'scaleX(0)';
                });
            });
        }, 10);
        
        // Auto-hide after duration
        this.snackbarTimeoutId = setTimeout(() => {
            this.hideSnackbar();
        }, duration);
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
        if (this.snackbarProgressInterval) {
            clearInterval(this.snackbarProgressInterval);
            this.snackbarProgressInterval = null;
        }
        this.pendingUndoAction = null;
    }
    
    addToUndoHistory(action) {
        // Add action to undo history
        this.undoHistory.push(action);
        
        // Keep only last 5 actions
        if (this.undoHistory.length > this.maxHistorySize) {
            this.undoHistory.shift();
        }
        
        // Clear redo history when new action is performed
        this.redoHistory = [];
    }
    
    performUndo() {
        if (this.undoHistory.length === 0) {
            this.showSnackbar("Can't undo anymore", null, 3000);
            return false;
        }
        
        const action = this.undoHistory.pop();
        
        // Store action for redo
        this.redoHistory.push(action);
        if (this.redoHistory.length > this.maxHistorySize) {
            this.redoHistory.shift();
        }
        
        // Perform undo
        if (action.undo) {
            action.undo();
        }
        
        return true;
    }
    
    performRedo() {
        if (this.redoHistory.length === 0) {
            return false;
        }
        
        const action = this.redoHistory.pop();
        
        // Perform redo (re-apply the action)
        if (action.redo) {
            action.redo();
        } else if (action.type === 'delete') {
            // For delete, redo means delete again
            this.tasks = this.tasks.filter(t => t.id !== action.task.id);
            if (this.currentRunningTask === action.task.id) {
                this.currentRunningTask = null;
                this.stopTimer();
            }
            this.saveToLocalStorage();
            this.renderTasks();
            this.renderFilterTabs();
        }
        
        // Store action back to undo history
        this.undoHistory.push(action);
        if (this.undoHistory.length > this.maxHistorySize) {
            this.undoHistory.shift();
        }
        
        return true;
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
            const svg = item.querySelector('svg');
            if (item.dataset.view === viewName) {
                item.classList.add('active');
                // Apply gradient to SVG when active
                if (svg) {
                    svg.setAttribute('stroke', 'url(#nav-gradient-active)');
                }
            } else {
                item.classList.remove('active');
                // Reset SVG to currentColor when not active
                if (svg) {
                    svg.setAttribute('stroke', 'currentColor');
                }
            }
        });
        
        // Switch views
        if (viewName === 'tags') {
            if (this.tasksView) this.tasksView.style.display = 'none';
            if (this.kanbanView) this.kanbanView.style.display = 'none';
            if (this.historyView) this.historyView.style.display = 'none';
            if (this.tagsView) this.tagsView.style.display = 'block';
            this.renderTagsManagement();
            // Hide toggle container on non-tasks views
            if (this.tagFilterTabsContainer) this.tagFilterTabsContainer.style.display = 'none';
        } else if (viewName === 'kanban') {
            if (this.tasksView) this.tasksView.style.display = 'none';
            if (this.tagsView) this.tagsView.style.display = 'none';
            if (this.historyView) this.historyView.style.display = 'none';
            if (this.kanbanView) this.kanbanView.style.display = 'block';
            // Hide toggle container on non-tasks views
            if (this.tagFilterTabsContainer) this.tagFilterTabsContainer.style.display = 'none';
            this.renderTasks();
            this.renderKanbanFilterTabs();
        } else if (viewName === 'history') {
            if (this.tasksView) this.tasksView.style.display = 'none';
            if (this.kanbanView) this.kanbanView.style.display = 'none';
            if (this.tagsView) this.tagsView.style.display = 'none';
            if (this.historyView) this.historyView.style.display = 'block';
            // Hide tasks filter tabs
            if (this.tagFilterTabsContainer) this.tagFilterTabsContainer.style.display = 'none';
            // Show history filter tabs
            this.renderHistoryFilterTabs();
            this.renderHistory();
        } else {
            // Tasks view
            if (this.kanbanView) this.kanbanView.style.display = 'none';
            if (this.tagsView) this.tagsView.style.display = 'none';
            if (this.historyView) this.historyView.style.display = 'none';
            if (this.tasksView) this.tasksView.style.display = 'block';
            this.renderTasks();
            this.renderFilterTabs();
        }
    }
    
    // Tag Management Methods
    showAddTagModal() {
        // Reset form
        if (this.tagNameInput) {
            this.tagNameInput.value = '';
        }
        this.selectedColor = this.tagColors[0].value;
        this.initializeModalColorPicker();
        
        // Show modal
        if (this.addTagModal) {
            this.addTagModal.classList.add('show');
        }
        
        // Focus on tag name input
        setTimeout(() => {
            if (this.tagNameInput) this.tagNameInput.focus();
        }, 100);
    }
    
    hideAddTagModal() {
        if (this.addTagModal) {
            this.addTagModal.classList.remove('show');
        }
    }
    
    initializeModalColorPicker() {
        if (!this.modalColorOptions) return;
        
        this.modalColorOptions.innerHTML = '';
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
                this.modalColorOptions.querySelectorAll('.color-option').forEach(btn => {
                    btn.classList.remove('selected');
                });
                colorBtn.classList.add('selected');
            };
            this.modalColorOptions.appendChild(colorBtn);
        });
    }
    
    createTagFromManagement() {
        const tagName = this.tagNameInput.value.trim();
        if (!tagName) return;
        
        // Check if tag already exists (case-insensitive)
        if (this.findTagByNameCaseInsensitive(tagName)) {
            this.showNotification('Tag already exists!');
            return;
        }
        
        // Create tag (preserve case)
        this.allTags.push({
            name: tagName,
            color: this.selectedColor
        });
        
        // Close modal and refresh
        this.hideAddTagModal();
        this.saveToLocalStorage();
        this.renderTagsManagement();
        this.renderFilterTabs();
        this.showNotification('Tag created!');
    }
    
    deleteTag(tagName) {
        // Prevent deletion of default tags (case-insensitive)
        const isDefault = this.defaultTags.some(dt => dt.toLowerCase() === tagName.toLowerCase());
        if (isDefault) {
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
        const tag = this.getTagByName(tagName);
        if (tag) {
            tag.color = newColor;
            this.saveToLocalStorage();
            this.renderTagsManagement();
            this.renderTasks();
        }
    }
    
    showEditTagModal(tagName) {
        const tag = this.getTagByName(tagName);
        if (!tag) return;
        
        // Check if it's a default tag (case-insensitive)
        const isDefault = this.defaultTags.some(dt => dt.toLowerCase() === tagName.toLowerCase());
        if (isDefault) {
            this.showNotification('Default tags cannot be renamed!');
            return;
        }
        
        // Store the tag being edited
        this.currentEditingTagName = tag.name;
        
        // Set input value
        if (this.editTagNameInput) {
            this.editTagNameInput.value = tag.name;
        }
        
        // Show modal
        if (this.editTagModal) {
            this.editTagModal.classList.add('show');
        }
        
        // Focus on input
        setTimeout(() => {
            if (this.editTagNameInput) this.editTagNameInput.focus();
            if (this.editTagNameInput) this.editTagNameInput.select();
        }, 100);
    }
    
    hideEditTagModal() {
        if (this.editTagModal) {
            this.editTagModal.classList.remove('show');
        }
        this.currentEditingTagName = null;
    }
    
    saveTagEdit() {
        if (!this.currentEditingTagName) return;
        
        const tag = this.getTagByName(this.currentEditingTagName);
        if (!tag) return;
        
        const newTagName = this.editTagNameInput.value.trim();
        if (!newTagName || newTagName === '') {
            this.hideEditTagModal();
            return;
        }
        
        // Check if new name already exists (case-insensitive, but not the same tag)
        const existingTag = this.findTagByNameCaseInsensitive(newTagName);
        if (existingTag && existingTag.name !== tag.name) {
            this.showNotification('Tag already exists!');
            return;
        }
        
        // Check if it's a default tag (case-insensitive)
        const isDefault = this.defaultTags.some(dt => dt.toLowerCase() === this.currentEditingTagName.toLowerCase());
        if (isDefault) {
            this.showNotification('Default tags cannot be renamed!');
            this.hideEditTagModal();
            return;
        }
        
        const oldName = tag.name;
        tag.name = newTagName;
        
        // Update all tasks that use this tag
        this.tasks.forEach(task => {
            if (task.tags) {
                const tagIndex = task.tags.findIndex(t => t.toLowerCase() === oldName.toLowerCase());
                if (tagIndex !== -1) {
                    task.tags[tagIndex] = newTagName;
                }
            }
        });
        
        // Update filter if needed
        if (this.selectedTagFilter === oldName) {
            this.selectedTagFilter = newTagName;
        }
        
        this.hideEditTagModal();
        this.saveToLocalStorage();
        this.renderTagsManagement();
        this.renderTasks();
        this.renderFilterTabs();
        this.renderKanbanFilterTabs();
        this.showNotification('Tag renamed!');
    }
    
    renderTagsManagement() {
        if (!this.tagsTableBody) return;
        
        this.tagsTableBody.innerHTML = '';
        
        if (this.allTags.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="3" style="text-align: center; padding: 40px; color: var(--text-tertiary);">No tags created yet. Click "Add Tag" to create one!</td>`;
            this.tagsTableBody.appendChild(row);
            return;
        }
        
        this.allTags.forEach(tag => {
            const isDefault = this.defaultTags.some(dt => dt.toLowerCase() === tag.name.toLowerCase());
            const row = document.createElement('tr');
            row.className = 'task-row';
            
            // Tag Name column
            const nameCell = document.createElement('td');
            nameCell.className = 'name-col';
            const tagPreview = document.createElement('span');
            tagPreview.className = 'task-tag';
            const transparentBg = this.hexToRgba(tag.color, 0.15);
            tagPreview.style.cssText = `background: ${transparentBg}; color: ${tag.color}`;
            tagPreview.textContent = tag.name;
            nameCell.appendChild(tagPreview);
            
            // Color column
            const colorCell = document.createElement('td');
            colorCell.className = 'tags-col';
            const colorOptions = document.createElement('div');
            colorOptions.className = 'tag-color-options';
            colorOptions.style.display = 'flex';
            colorOptions.style.gap = '8px';
            colorOptions.style.flexWrap = 'wrap';
            
            this.tagColors.forEach(color => {
                const colorBtn = document.createElement('button');
                const isSelected = tag.color === color.value;
                colorBtn.className = `tag-color-option ${isSelected ? 'selected' : ''}`;
                colorBtn.style.backgroundColor = color.value;
                if (!isSelected) {
                    colorBtn.style.opacity = '0.4';
                    // Remove transparency on hover
                    colorBtn.addEventListener('mouseenter', () => {
                        colorBtn.style.opacity = '1';
                    });
                    colorBtn.addEventListener('mouseleave', () => {
                        colorBtn.style.opacity = '0.4';
                    });
                }
                colorBtn.title = color.name;
                colorBtn.onclick = () => this.changeTagColor(tag.name, color.value);
                colorOptions.appendChild(colorBtn);
            });
            
            colorCell.appendChild(colorOptions);
            
            // Actions column
            const actionsCell = document.createElement('td');
            actionsCell.className = 'status-col';
            const actionsContainer = document.createElement('div');
            actionsContainer.className = 'table-actions';
            actionsContainer.style.justifyContent = 'flex-end';
            
            // Edit button (only for editable tags)
            if (!isDefault) {
                const editBtn = document.createElement('button');
                editBtn.className = 'table-action-btn small-icon';
                editBtn.title = 'Edit tag name';
                editBtn.innerHTML = `
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                    </svg>
                `;
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.showEditTagModal(tag.name);
                });
                actionsContainer.appendChild(editBtn);
            }
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'table-action-btn danger small-icon';
            if (isDefault) {
                deleteBtn.title = 'Default tags cannot be deleted. These are system tags that help organize your tasks.';
                deleteBtn.disabled = true;
                deleteBtn.style.opacity = '0.3';
                deleteBtn.style.cursor = 'not-allowed';
            } else {
                deleteBtn.title = 'Delete tag';
            }
            deleteBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6"/>
                </svg>
            `;
            if (!isDefault) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteTag(tag.name);
                });
            }
            
            actionsContainer.appendChild(deleteBtn);
            actionsCell.appendChild(actionsContainer);
            
            // Append all cells to row
            row.appendChild(nameCell);
            row.appendChild(colorCell);
            row.appendChild(actionsCell);
            
            this.tagsTableBody.appendChild(row);
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
        
        // Get filtered tags based on search (case-insensitive)
        const filteredTags = this.allTags.filter(tag => 
            !searchValue || tag.name.toLowerCase().includes(searchValue.toLowerCase())
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
        
        // Filter tags (case-insensitive search)
        const filteredTags = this.allTags.filter(tag => 
            !searchValue || tag.name.toLowerCase().includes(searchValue)
        );
        
        listElement.innerHTML = '';
        
        // Show filtered existing tags (case-insensitive check)
        filteredTags.forEach(tag => {
            const isChecked = taskTags.some(t => t.toLowerCase() === tag.name.toLowerCase());
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
        
        // Show create option if search value doesn't exist (case-insensitive)
        if (searchValue && !this.findTagByNameCaseInsensitive(searchValue)) {
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
        const value = input.value.trim();
        if (!value) return;
        
        this.createAndAddTag(taskId, value);
        input.value = '';
        this.handleTagSearch(input, taskId);
    }
    
    createAndAddTag(taskId, tagName) {
        const trimmedTag = tagName.trim();
        if (!trimmedTag) return;
        
        // Find existing tag (case-insensitive) or create new one
        const existingTag = this.findTagByNameCaseInsensitive(trimmedTag);
        if (!existingTag) {
            // Add to allTags if new (with random color, preserve case)
            const randomColor = this.tagColors[Math.floor(Math.random() * this.tagColors.length)];
            this.allTags.push({
                name: trimmedTag,
                color: randomColor.value
            });
        }
        
        // Use the actual tag name from allTags (case-sensitive match)
        const actualTag = this.findTagByNameCaseInsensitive(trimmedTag);
        if (actualTag) {
            // Add to task using the actual tag name
            this.toggleTaskTag(taskId, actualTag.name);
        }
        this.saveToLocalStorage();
        this.renderFilterTabs();
    }
    
    getTagColor(tagName) {
        const tag = this.getTagByName(tagName);
        return tag ? tag.color : this.tagColors[0].value; // Default to purple
    }
    
    getEmojiForTaskName(taskName) {
        if (!taskName || !taskName.trim()) return '📝';
        
        const name = taskName.toLowerCase().trim();
        
        // Use the comprehensive keyword map
        const keywordMap = this.emojiKeywordMap || {};
        
        // Split task name into words
        const words = name.split(/\s+/).map(word => word.replace(/[^a-z0-9]/g, '')).filter(word => word.length > 1);
        
        // Check each word against the keyword map
        for (const word of words) {
            if (keywordMap[word] && keywordMap[word].length > 0) {
                // Return the first matching emoji for this keyword
                return keywordMap[word][0];
            }
        }
        
        // Also check for compound matches (e.g., "wastebasket", "trashcan")
        for (const keyword in keywordMap) {
            if (name.includes(keyword) && keywordMap[keyword].length > 0) {
                return keywordMap[keyword][0];
            }
        }
        
        // Default emoji if no match
        return '📝';
    }
    
    renderEmojiPicker() {
        if (!this.emojiPickerDropdown || !this.emojiCategoryTabs || !this.emojiGridContainer) return;
        
        // Render category tabs - include Recent tab if there are recent emojis
        const categoryNames = Object.keys(this.emojiCategories);
        let categoryTabsHtml = '';
        
        // Add Recent tab first if there are recent emojis
        if (this.recentEmojis && this.recentEmojis.length > 0) {
            categoryTabsHtml += `<button type="button" class="emoji-category-tab ${this.selectedEmojiCategory === 'Recent' ? 'active' : ''}" 
                     data-category="Recent">Recent</button>`;
        }
        
        // Add other category tabs
        categoryTabsHtml += categoryNames.map(category => 
            `<button type="button" class="emoji-category-tab ${category === this.selectedEmojiCategory ? 'active' : ''}" 
                     data-category="${category}">${category.split(' ')[0]}</button>`
        ).join('');
        
        this.emojiCategoryTabs.innerHTML = categoryTabsHtml;
        
        // Add category tab click listeners
        this.emojiCategoryTabs.querySelectorAll('.emoji-category-tab').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const category = e.target.getAttribute('data-category');
                this.selectedEmojiCategory = category;
                this.renderEmojiGrid();
                // Update active tab
                this.emojiCategoryTabs.querySelectorAll('.emoji-category-tab').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
            });
        });
        
        // Render emoji grid
        this.renderEmojiGrid();
        
        // Setup search (remove old listener if exists to prevent duplicates)
        if (this.emojiSearchInput) {
            // Clone the element to remove all event listeners
            const newSearchInput = this.emojiSearchInput.cloneNode(true);
            this.emojiSearchInput.parentNode.replaceChild(newSearchInput, this.emojiSearchInput);
            this.emojiSearchInput = newSearchInput;
            
            this.emojiSearchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase().trim();
                // Clear active category when searching to show all results
                if (searchTerm) {
                    this.emojiCategoryTabs.querySelectorAll('.emoji-category-tab').forEach(t => t.classList.remove('active'));
                }
                this.filterEmojis(searchTerm);
            });
        }
    }
    
    renderEmojiGrid() {
        if (!this.emojiGridContainer) return;
        
        let emojis = [];
        
        // Handle Recent category
        if (this.selectedEmojiCategory === 'Recent' && this.recentEmojis && this.recentEmojis.length > 0) {
            // Get the 40 most recent emojis (already sorted by timestamp, most recent first)
            emojis = this.recentEmojis.slice(0, 40).map(item => item.emoji);
        } else {
            // Use regular category emojis
            emojis = this.emojiCategories[this.selectedEmojiCategory] || [];
        }
        
        const emojiGrid = emojis.map(emoji => {
            const emojiName = this.getEmojiName(emoji);
            return `<button type="button" class="emoji-option" data-emoji="${emoji}" title="${emojiName}">${emoji}</button>`;
        }).join('');
        
        this.emojiGridContainer.innerHTML = emojiGrid;
        
        // Add click listeners to emoji options
        this.emojiGridContainer.querySelectorAll('.emoji-option').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const emoji = e.target.getAttribute('data-emoji');
                this.selectEmoji(emoji, true); // true = manually selected
                this.emojiPickerDropdown.style.display = 'none';
                if (this.emojiSearchInput) {
                    this.emojiSearchInput.value = '';
                }
            });
        });
    }
    
    filterEmojis(searchTerm) {
        if (!this.emojiGridContainer) return;
        
        if (!searchTerm) {
            // Show current category emojis
            this.renderEmojiGrid();
            return;
        }
        
        // Use the cached keyword map (built from emoji names)
        const emojiKeywordMap = { ...(this.emojiKeywordMap || {}) };
        
        // Additional manual mappings for edge cases not captured by name extraction
        const additionalMappings = {
            // Animals
            'elephant': ['🐘'],
            'cat': ['🐱', '🐈', '🐈‍⬛'],
            'dog': ['🐶', '🐕', '🐩', '🦮', '🐕‍🦺'],
            'bird': ['🐦', '🐧', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇', '🦚', '🦜', '🦢', '🦩', '🕊️'],
            'fish': ['🐟', '🐠', '🐡', '🦈', '🐬', '🐳', '🐋'],
            'bear': ['🐻', '🐼'],
            'tiger': ['🐯'],
            'lion': ['🦁'],
            'monkey': ['🐵', '🙈', '🙉', '🙊', '🐒'],
            'rabbit': ['🐰', '🐇'],
            'mouse': ['🐭', '🐁', '🐀'],
            'hamster': ['🐹'],
            'fox': ['🦊'],
            'pig': ['🐷', '🐽', '🐖'],
            'cow': ['🐮', '🐄', '🐃', '🐂'],
            'horse': ['🐴', '🐎'],
            'unicorn': ['🦄'],
            'deer': ['🦌'],
            'goat': ['🐐'],
            'sheep': ['🐑', '🐏'],
            'llama': ['🦙'],
            'giraffe': ['🦒'],
            'zebra': ['🦓'],
            'camel': ['🐪', '🐫'],
            'rhino': ['🦏'],
            'hippo': ['🦛'],
            'panda': ['🐼'],
            'koala': ['🐨'],
            'crocodile': ['🐊'],
            'turtle': ['🐢'],
            'snake': ['🐍'],
            'lizard': ['🦎'],
            'dinosaur': ['🦖', '🦕'],
            'whale': ['🐋', '🐳'],
            'octopus': ['🐙'],
            'squid': ['🦑'],
            'shrimp': ['🦐'],
            'lobster': ['🦞'],
            'crab': ['🦀'],
            'butterfly': ['🦋'],
            'bee': ['🐝'],
            'bug': ['🐛', '🪲', '🪳', '🦟', '🦗', '🐜', '🐞'],
            'snail': ['🐌'],
            'spider': ['🕷️', '🕸️'],
            'scorpion': ['🦂'],
            'worm': ['🪱'],
            'frog': ['🐸'],
            'chicken': ['🐔', '🐓', '🐤', '🐣', '🐥'],
            'rooster': ['🐓'],
            'turkey': ['🦃'],
            'duck': ['🦆'],
            'owl': ['🦉'],
            'eagle': ['🦅'],
            'bat': ['🦇'],
            'wolf': ['🐺'],
            'boar': ['🐗'],
            'rabbit': ['🐰', '🐇'],
            'raccoon': ['🦝'],
            'badger': ['🦡'],
            'otter': ['🦦'],
            'beaver': ['🦫'],
            'skunk': ['🦨'],
            'hedgehog': ['🦔'],
            'squirrel': ['🐿️'],
            'sloth': ['🦥'],
            'mammoth': ['🦣'],
            'gorilla': ['🦍'],
            'orangutan': ['🦧'],
            'bison': ['🦬'],
            'buffalo': ['🐃', '🦬'],
            'ox': ['🐂'],
            'ram': ['🐏'],
            'ewe': ['🐑'],
            'penguin': ['🐧'],
            'peacock': ['🦚'],
            'parrot': ['🦜'],
            'swan': ['🦢'],
            'flamingo': ['🦩'],
            'dove': ['🕊️'],
            'dodo': ['🦤'],
            'chipmunk': ['🐿️'],
            'rat': ['🐀'],
            'mouseface': ['🐭'],
            'ladybug': ['🐞'],
            'ladybeetle': ['🐞'],
            'cockroach': ['🪳'],
            'beetle': ['🪲'],
            'mosquito': ['🦟'],
            'cricket': ['🦗'],
            'ants': ['🐜'],
            'tropicalfish': ['🐠'],
            'blowfish': ['🐡'],
            'dolphin': ['🐬'],
            'shark': ['🦈'],
            'spoutingwhale': ['🐳'],
            'trex': ['🦖'],
            'sauropod': ['🦕'],
            'hippopotamus': ['🦛'],
            'rhinoceros': ['🦏'],
            'dromedarycamel': ['🐪'],
            'bactriancamel': ['🐫'],
            'kangaroo': ['🦘'],
            'waterbuffalo': ['🐃'],
            'poodle': ['🐩'],
            'guidedog': ['🦮'],
            'servicedog': ['🐕‍🦺'],
            'blackcat': ['🐈‍⬛'],
            'rooster': ['🐓'],
            'chick': ['🐤', '🐣', '🐥'],
            'baby': ['🐤', '🐣', '🐥'],
            'hatching': ['🐣'],
            'frontfacing': ['🐥'],
            
            // Food
            'pizza': ['🍕'],
            'burger': ['🍔'],
            'fries': ['🍟'],
            'hotdog': ['🌭'],
            'sandwich': ['🥪'],
            'taco': ['🌮'],
            'burrito': ['🌯'],
            'popcorn': ['🍿'],
            'donut': ['🍩'],
            'cookie': ['🍪'],
            'cake': ['🎂', '🍰', '🧁'],
            'icecream': ['🍦', '🍨', '🍧'],
            'coffee': ['☕️', '☕'],
            'tea': ['🍵', '🫖'],
            'beer': ['🍺', '🍻'],
            'wine': ['🍷'],
            'cocktail': ['🍸', '🍹', '🍾'],
            'water': ['💧', '💦'],
            'milk': ['🥛', '🍼'],
            'juice': ['🧃'],
            'boba': ['🧋'],
            'soda': ['🥤'],
            'apple': ['🍎', '🍏'],
            'banana': ['🍌'],
            'orange': ['🍊'],
            'lemon': ['🍋'],
            'grape': ['🍇'],
            'strawberry': ['🍓'],
            'watermelon': ['🍉'],
            'pineapple': ['🍍'],
            'mango': ['🥭'],
            'coconut': ['🥥'],
            'kiwi': ['🥝'],
            'pear': ['🍐'],
            'peach': ['🍑'],
            'cherry': ['🍒'],
            'melon': ['🍈'],
            'bread': ['🍞', '🥖', '🥐', '🥯', '🥨'],
            'cheese': ['🧀'],
            'egg': ['🥚'],
            'bacon': ['🥓'],
            'meat': ['🥩', '🍖'],
            'chicken': ['🍗'],
            'fish': ['🐟', '🐠', '🐡'],
            'sushi': ['🍣', '🍱'],
            'rice': ['🍚', '🍙', '🍘'],
            'noodles': ['🍜', '🍝'],
            'soup': ['🍲', '🍛', '🥘', '🫕'],
            'tamale': ['🫔'],
            'falafel': ['🧆'],
            'flatbread': ['🫓'],
            // Vegetables & Fruits
            'eggplant': ['🍆'],
            'aubergine': ['🍆'],
            'tomato': ['🍅'],
            'cucumber': ['🥒'],
            'carrot': ['🥕'],
            'potato': ['🥔'],
            'sweetpotato': ['🍠'],
            'sweet': ['🍠'],
            'corn': ['🌽'],
            'pepper': ['🌶️'],
            'hotpepper': ['🌶️'],
            'chili': ['🌶️'],
            'chilli': ['🌶️'],
            'broccoli': ['🥦'],
            'avocado': ['🥑'],
            'green': ['🥬'],
            'lettuce': ['🥬'],
            'salad': ['🥗'],
            'olive': ['🫒'],
            'mushroom': ['🍄'],
            'onion': ['🧅'],
            'garlic': ['🧄'],
            'ginger': ['🫚'],
            'pea': ['🫛'],
            'peas': ['🫛'],
            'beans': ['🫘'],
            'peanuts': ['🥜'],
            'chestnut': ['🌰'],
            'fruit': ['🍎', '🍏', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝'],
            'vegetable': ['🍆', '🍅', '🥑', '🥦', '🥬', '🥒', '🌶️', '🌽', '🥕', '🫒', '🥔', '🍠'],
            'vegetables': ['🍆', '🍅', '🥑', '🥦', '🥬', '🥒', '🌶️', '🌽', '🥕', '🫒', '🥔', '🍠'],
            'vegetarian': ['🍆', '🍅', '🥑', '🥦', '🥬', '🥒', '🌶️', '🌽', '🥕', '🫒', '🥔', '🍠'],
            
            // Objects & Things
            'phone': ['📱', '📲', '☎️', '📞'],
            'computer': ['💻', '🖥️', '⌨️'],
            'keyboard': ['⌨️'],
            'mouse': ['🖱️', '🖲️'],
            'camera': ['📷', '📸'],
            'video': ['📹', '🎥', '📽️', '🎞️'],
            'tv': ['📺'],
            'radio': ['📻'],
            'book': ['📖', '📚', '📕', '📗', '📘', '📙', '📓', '📔', '📒', '📃', '📄', '📑'],
            'money': ['💰', '💵', '💴', '💶', '💷', '💸', '💳'],
            'dollar': ['💵'],
            'euro': ['💶'],
            'yen': ['💴'],
            'pound': ['💷'],
            'creditcard': ['💳'],
            'gift': ['🎁'],
            'balloon': ['🎈'],
            'party': ['🎉', '🎊'],
            'fireworks': ['🎆', '🎇'],
            'crown': ['👑'],
            'gem': ['💎'],
            'ring': ['💍'],
            'watch': ['⌚'],
            'hourglass': ['⌛', '⏳'],
            'clock': ['🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛', '🕰️', '⏰', '⏲️', '⏱️'],
            
            // Vehicles
            'car': ['🚗', '🚙', '🚕', '🚖', '🚘'],
            'bus': ['🚌', '🚍', '🚎'],
            'truck': ['🚚', '🚛'],
            'motorcycle': ['🏍️', '🛵'],
            'bike': ['🚲', '🛴'],
            'train': ['🚂', '🚃', '🚄', '🚅', '🚆', '🚇', '🚈', '🚉', '🚊', '🚝', '🚞', '🚋'],
            'plane': ['✈️', '🛫', '🛬', '🛩️'],
            'helicopter': ['🚁'],
            'rocket': ['🚀'],
            'ufo': ['🛸'],
            'ship': ['🚢'],
            'boat': ['⛵', '🚤', '🛥️'],
            'sailboat': ['⛵'],
            
            // Places
            'house': ['🏠', '🏡'],
            'home': ['🏠', '🏡'],
            'building': ['🏢', '🏬', '🏣', '🏤', '🏥', '🏦', '🏨', '🏩', '🏪', '🏫', '🏭'],
            'school': ['🏫'],
            'hospital': ['🏥'],
            'bank': ['🏦'],
            'hotel': ['🏨'],
            'store': ['🏪', '🏬'],
            'church': ['⛪'],
            'mosque': ['🕌'],
            'synagogue': ['🕍'],
            'temple': ['🛕', '⛩️'],
            'castle': ['🏰', '🏯'],
            'statue': ['🗽', '🗼'],
            'mountain': ['⛰️', '🏔️'],
            'volcano': ['🌋'],
            'island': ['🏝️'],
            'beach': ['🏖️'],
            'camping': ['⛺', '🏕️'],
            'desert': ['🏜️'],
            'park': ['🏞️'],
            'stadium': ['🏟️'],
            'factory': ['🏭'],
            
            // Gestures & People
            'wave': ['👋'],
            'thumbsup': ['👍'],
            'thumbsdown': ['👎'],
            'ok': ['👌'],
            'peace': ['✌️'],
            'clap': ['👏'],
            'pray': ['🙏'],
            'muscle': ['💪'],
            'point': ['👈', '👉', '👆', '👇', '☝️'],
            'fist': ['✊', '👊', '🤛', '🤜'],
            'handshake': ['🤝'],
            'victory': ['✌️'],
            'rock': ['🤘'],
            'callme': ['🤙'],
            'pinch': ['🤏'],
            'fingerscrossed': ['🤞'],
            'loveyou': ['🤟'],
            'writing': ['✍️'],
            'nose': ['👃'],
            'ear': ['👂', '🦻'],
            'eye': ['👀', '👁️'],
            'tongue': ['👅'],
            'mouth': ['👄'],
            'brain': ['🧠'],
            'tooth': ['🦷'],
            'bone': ['🦴'],
            
            // Emotions
            'smile': ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗'],
            'happy': ['😀', '😃', '😄', '😁', '😆', '😊', '🙂', '😍', '🥰'],
            'laugh': ['😂', '🤣', '😆'],
            'love': ['😍', '🥰', '😘', '😗', '😚', '😙', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎'],
            'heart': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝'],
            'sad': ['😔', '😟', '🙁', '☹️', '😢', '😭', '😥', '😰'],
            'cry': ['😢', '😭'],
            'angry': ['😠', '😡', '🤬'],
            'mad': ['😠', '😡'],
            'confused': ['😕', '😟', '🙁', '🤔', '😵', '😵‍💫'],
            'surprised': ['😮', '😯', '😲', '😳', '😱', '🤯'],
            'scared': ['😨', '😰', '😱', '😦', '😧'],
            'tired': ['😴', '😪', '😫', '😩', '🥱'],
            'sleepy': ['😴', '😪'],
            'sick': ['🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶'],
            'nauseous': ['🤢', '🤮'],
            'hot': ['🥵'],
            'cold': ['🥶'],
            'cool': ['😎', '🆒'],
            'smart': ['🤓', '🧐'],
            'funny': ['🤪', '😜', '😝', '😛'],
            'silly': ['🤪', '😜', '😝'],
            'wink': ['😉', '😜'],
            'kiss': ['😘', '😗', '😚', '😙', '💋'],
            'star': ['⭐', '🌟', '💫'],
            'fire': ['🔥'],
            'lightning': ['⚡'],
            'rain': ['🌧️', '⛈️', '🌩️', '☔'],
            'snow': ['❄️', '⛄', '☃️'],
            'sun': ['☀️', '🌞'],
            'moon': ['🌙', '🌚', '🌛', '🌜', '🌝'],
            'cloud': ['☁️', '⛅', '🌤️', '🌥️', '🌦️'],
            
            // Activities
            'sport': ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏'],
            'football': ['⚽', '🏈'],
            'basketball': ['🏀'],
            'baseball': ['⚾', '🥎'],
            'tennis': ['🎾'],
            'soccer': ['⚽'],
            'golf': ['⛳'],
            'bowling': ['🎳'],
            'swimming': ['🏊'],
            'running': ['🏃'],
            'cycling': ['🚴'],
            'music': ['🎵', '🎶', '🎤', '🎧', '🎼', '🎹', '🥁', '🎷', '🎺', '🎸', '🪕', '🎻'],
            'guitar': ['🎸'],
            'piano': ['🎹'],
            'drum': ['🥁'],
            'trumpet': ['🎺'],
            'saxophone': ['🎷'],
            'violin': ['🎻'],
            'microphone': ['🎤'],
            'headphones': ['🎧'],
            'game': ['🎮', '🎰', '🎲', '🃏', '🀄', '🎴'],
            'dice': ['🎲'],
            'trophy': ['🏆', '🥇', '🥈', '🥉', '🏅'],
            'medal': ['🏅', '🎖️'],
            
            // Nature
            'tree': ['🌲', '🌳'],
            'flower': ['🌻', '🌺', '🌹', '🌷', '🌼', '🌸', '💐'],
            'rose': ['🌹'],
            'sunflower': ['🌻'],
            'leaf': ['🍃', '🍂'],
            'mushroom': ['🍄'],
            'cactus': ['🌵'],
            'palm': ['🌴'],
            'seedling': ['🌱'],
            'herb': ['🌿', '☘️'],
            'shamrock': ['☘️', '🍀'],
            'fourleaf': ['🍀'],
            
            // Symbols
            'check': ['✅', '✔️'],
            'x': ['❌', '✖️'],
            'warning': ['⚠️'],
            'stop': ['🛑'],
            'no': ['🚫', '⛔'],
            'yes': ['✅'],
            'question': ['❓', '❔'],
            'exclamation': ['❗', '❕'],
            'arrow': ['➡️', '⬅️', '⬆️', '⬇️', '↗️', '↘️', '↙️', '↖️'],
            'recycle': ['♻️'],
            'info': ['ℹ️'],
            'zzz': ['💤'],
            
            // Bathroom & Toilet
            'toilet': ['🚽'],
            'bathroom': ['🚽', '🚿', '🛁', '🧼'],
            'restroom': ['🚽'],
            'wc': ['🚽'],
            'lavatory': ['🚽'],
            'shower': ['🚿'],
            'bathtub': ['🛁'],
            'bath': ['🛁'],
            'soap': ['🧼'],
            'trash': ['🗑️'],
            'garbage': ['🗑️'],
            'waste': ['🗑️'],
            'rubbish': ['🗑️'],
            'bin': ['🗑️'],
            'dumpster': ['🗑️'],
            'vacuum': ['🧹'],
            'broom': ['🧹'],
            'sweep': ['🧹'],
            'cleaning': ['🧹', '🧼'],
        };
        
        // Merge additional mappings with generated keyword map
        Object.keys(additionalMappings).forEach(keyword => {
            if (!emojiKeywordMap[keyword]) {
                emojiKeywordMap[keyword] = [];
            }
            additionalMappings[keyword].forEach(emoji => {
                if (!emojiKeywordMap[keyword].includes(emoji)) {
                    emojiKeywordMap[keyword].push(emoji);
                }
            });
        });
        
        // Search across all categories
        const allEmojis = Object.values(this.emojiCategories).flat();
        const searchLower = searchTerm.toLowerCase().trim();
        const searchWords = searchLower.split(/\s+/);
        
        // First, try to find specific emojis by keyword
        const specificMatches = new Set();
        
        // Check exact match first
        if (emojiKeywordMap[searchLower]) {
            emojiKeywordMap[searchLower].forEach(emoji => specificMatches.add(emoji));
        }
        
        // Then check partial matches
        Object.keys(emojiKeywordMap).forEach(keyword => {
            // Check if search term matches keyword (supports partial matches)
            if (searchLower === keyword || 
                searchLower.includes(keyword) || 
                keyword.includes(searchLower)) {
                emojiKeywordMap[keyword].forEach(emoji => specificMatches.add(emoji));
            }
            // Also check individual words for multi-word searches
            if (searchWords.length > 1) {
                searchWords.forEach(word => {
                    if (word === keyword || keyword.includes(word) || word.includes(keyword)) {
                        emojiKeywordMap[keyword].forEach(emoji => specificMatches.add(emoji));
                    }
                });
            }
        });
        
        // Also check if any emoji character itself matches (rare but useful)
        allEmojis.forEach(emoji => {
            if (emoji === searchTerm) {
                specificMatches.add(emoji);
            }
        });
        
        // If we found specific matches, use those
        let filtered = [];
        if (specificMatches.size > 0) {
            filtered = Array.from(specificMatches);
        } else {
            // Fallback: search category names
            const matchingCategories = new Set();
            Object.keys(this.emojiCategories).forEach(category => {
                if (category.toLowerCase().includes(searchLower)) {
                    matchingCategories.add(category);
                }
            });
            
            if (matchingCategories.size > 0) {
                matchingCategories.forEach(category => {
                    if (this.emojiCategories[category]) {
                        filtered.push(...this.emojiCategories[category]);
                    }
                });
            } else {
                // Last resort: show all emojis if nothing matches
                filtered = allEmojis;
            }
        }
        
        // Remove duplicates and limit results
        const uniqueFiltered = [...new Set(filtered)].slice(0, 100);
        
        const emojiGrid = uniqueFiltered.map(emoji => {
            const emojiName = this.getEmojiName(emoji);
            return `<button type="button" class="emoji-option" data-emoji="${emoji}" title="${emojiName}">${emoji}</button>`;
        }).join('');
        
        this.emojiGridContainer.innerHTML = emojiGrid;
        
        // Add click listeners
        this.emojiGridContainer.querySelectorAll('.emoji-option').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const emoji = e.target.getAttribute('data-emoji');
                this.selectEmoji(emoji, true); // true = manually selected
                this.emojiPickerDropdown.style.display = 'none';
                if (this.emojiSearchInput) {
                    this.emojiSearchInput.value = '';
                }
            });
        });
    }
    
    selectEmoji(emoji, isManual = false) {
        if (this.selectedEmojiDisplay) {
            this.selectedEmojiDisplay.textContent = emoji;
        }
        // Track if this was a manual selection
        if (isManual) {
            this.emojiManuallySelected = true;
        }
    }
    
    getSelectedEmoji() {
        return this.selectedEmojiDisplay ? this.selectedEmojiDisplay.textContent.trim() : '📝';
    }
    
    addToRecentEmojis(emoji) {
        if (!emoji || emoji.trim() === '') return;
        
        // Remove emoji if it already exists (to move it to the top)
        this.recentEmojis = this.recentEmojis.filter(e => e.emoji !== emoji);
        
        // Add to the beginning of the array with current timestamp
        this.recentEmojis.unshift({
            emoji: emoji,
            timestamp: Date.now()
        });
        
        // Keep only the 40 most recent
        if (this.recentEmojis.length > 40) {
            this.recentEmojis = this.recentEmojis.slice(0, 40);
        }
    }
    
    renderTaskEmojiCircle(task) {
        if (!task.emoji) return '';
        let bgColor;
        if (task.tags && task.tags.length > 0) {
            const tagColor = this.getTagColor(task.tags[0]);
            bgColor = this.hexToRgba(tagColor, 0.15);
        } else {
            // Use purple-primary with same transparency as tags
            bgColor = this.hexToRgba('#A78BFA', 0.15);
        }
        return `<div class="task-emoji-circle" style="background-color: ${bgColor}">${task.emoji}</div>`;
    }
    
    getTagByName(tagName) {
        // Case-insensitive comparison
        return this.allTags.find(t => t.name.toLowerCase() === tagName.toLowerCase());
    }
    
    findTagByNameCaseInsensitive(tagName) {
        // Helper to find tag with case-insensitive comparison
        return this.allTags.find(t => t.name.toLowerCase() === tagName.toLowerCase());
    }
    
    toggleTaskTag(taskId, tagName) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;
        
        // Initialize tags if needed
        if (!task.tags) {
            task.tags = [];
        }
        
        // Find the actual tag name (case-sensitive) from allTags
        const actualTag = this.getTagByName(tagName);
        if (!actualTag) return;
        
        const actualTagName = actualTag.name;
        
        // Toggle tag (use case-insensitive check but store actual case)
        const tagIndex = task.tags.findIndex(t => t.toLowerCase() === actualTagName.toLowerCase());
        if (tagIndex !== -1) {
            task.tags = task.tags.filter(tag => tag.toLowerCase() !== actualTagName.toLowerCase());
        } else {
            task.tags.push(actualTagName);
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
        if (!this.tagFilterTabs || !this.tagFilterTabsContainer) return;
        
        // Only show container if there are tags
        if (this.allTags.length === 0) {
            this.tagFilterTabsContainer.style.display = 'none';
            return;
        }
        
        this.tagFilterTabs.innerHTML = '';
        
        // Count all tasks
        const allCount = this.tasks.length;
        
        // Only show "All" tab if it has 1 or more entries
        if (allCount >= 1) {
            const allTab = document.createElement('button');
            allTab.className = `filter-tab ${this.selectedTagFilter === 'all' ? 'active' : ''}`;
            allTab.dataset.filter = 'all';
            allTab.innerHTML = `
                <span class="filter-tab-label">All</span>
                <span class="filter-tab-badge">${allCount}</span>
            `;
            allTab.onclick = () => this.setTagFilter('all');
            this.tagFilterTabs.appendChild(allTab);
        }
        
        // Create tabs for each tag, but only if they have 1 or more entries
        this.allTags.forEach(tag => {
            // Count tasks with this tag
            const tagCount = this.tasks.filter(task => 
                task.tags && task.tags.some(t => t.toLowerCase() === tag.name.toLowerCase())
            ).length;
            
            // Only create tab if count is 1 or more
            if (tagCount >= 1) {
                const tab = document.createElement('button');
                tab.className = `filter-tab ${this.selectedTagFilter === tag.name ? 'active' : ''}`;
                tab.dataset.filter = tag.name;
                tab.innerHTML = `
                    <span class="filter-tab-label">${tag.name}</span>
                    <span class="filter-tab-badge" style="background: ${tag.color}20; color: ${tag.color}">${tagCount}</span>
                `;
                tab.onclick = () => this.setTagFilter(tag.name);
                this.tagFilterTabs.appendChild(tab);
            }
        });
        
        // Show container if there are any tasks in storage (even if all tabs are hidden)
        // Only hide if there are 0 tasks total
        if (this.tasks.length > 0) {
            this.tagFilterTabsContainer.style.display = 'flex';
        } else {
            this.tagFilterTabsContainer.style.display = 'none';
        }
    }
    
    renderKanbanFilterTabs() {
        if (!this.kanbanFilterTabs) return;
        
        // Only show tabs if there are tags
        if (this.allTags.length === 0) {
            this.kanbanFilterTabs.style.display = 'none';
            return;
        }
        
        this.kanbanFilterTabs.innerHTML = '';
        
        // Count only non-completed tasks on the board
        const allCount = this.tasks.filter(task => 
            (task.state === this.TASK_STATES.TODAY || 
             task.state === this.TASK_STATES.IN_PROGRESS) &&
            !(task.isCompleted || task.state === this.TASK_STATES.COMPLETE)
        ).length;
        
        // Only show "All" tab if it has 1 or more entries
        if (allCount >= 1) {
            const allTab = document.createElement('button');
            allTab.className = `filter-tab ${this.selectedTagFilter === 'all' ? 'active' : ''}`;
            allTab.dataset.filter = 'all';
            allTab.innerHTML = `
                <span class="filter-tab-label">All</span>
                <span class="filter-tab-badge">${allCount}</span>
            `;
            allTab.onclick = () => this.setTagFilter('all');
            this.kanbanFilterTabs.appendChild(allTab);
        }
        
        // Create tabs for each tag, but only if they have 1 or more entries
        this.allTags.forEach(tag => {
            // Count non-completed tasks with this tag on the board (case-insensitive)
            const tagCount = this.tasks.filter(task => 
                (task.state === this.TASK_STATES.TODAY || 
                 task.state === this.TASK_STATES.IN_PROGRESS) &&
                !(task.isCompleted || task.state === this.TASK_STATES.COMPLETE) &&
                task.tags && task.tags.some(t => t.toLowerCase() === tag.name.toLowerCase())
            ).length;
            
            // Only create tab if count is 1 or more
            if (tagCount >= 1) {
                const tab = document.createElement('button');
                tab.className = `filter-tab ${this.selectedTagFilter === tag.name ? 'active' : ''}`;
                tab.dataset.filter = tag.name;
                tab.innerHTML = `
                    <span class="filter-tab-label">${tag.name}</span>
                    <span class="filter-tab-badge" style="background: ${tag.color}20; color: ${tag.color}">${tagCount}</span>
                `;
                tab.onclick = () => this.setTagFilter(tag.name);
                this.kanbanFilterTabs.appendChild(tab);
            }
        });
        
        // Show or hide tabs container based on whether any tabs were added
        if (this.kanbanFilterTabs.children.length > 0) {
            this.kanbanFilterTabs.style.display = 'flex';
        } else {
            this.kanbanFilterTabs.style.display = 'none';
        }
    }
    
    renderHistoryFilterTabs() {
        if (!this.historyFilterTabs || !this.historyFilterTabsContainer) return;
        
        // Get completed tasks (filter out duplicates - most recent completion per task)
        const completedTasks = this.tasks.filter(task => task.completedAt);
        const taskMap = new Map();
        completedTasks.forEach(task => {
            const existing = taskMap.get(task.id);
            if (!existing || task.completedAt > existing.completedAt) {
                taskMap.set(task.id, task);
            }
        });
        const uniqueCompletedTasks = Array.from(taskMap.values());
        
        // Only show container if there are tags and completed tasks
        if (this.allTags.length === 0 || uniqueCompletedTasks.length === 0) {
            this.historyFilterTabsContainer.style.display = 'none';
            return;
        }
        
        this.historyFilterTabs.innerHTML = '';
        
        // Count all completed tasks
        const allCount = uniqueCompletedTasks.length;
        
        // Only show "All" tab if it has 1 or more entries
        if (allCount >= 1) {
            const allTab = document.createElement('button');
            allTab.className = `filter-tab ${this.selectedTagFilter === 'all' ? 'active' : ''}`;
            allTab.dataset.filter = 'all';
            allTab.innerHTML = `
                <span class="filter-tab-label">All</span>
                <span class="filter-tab-badge">${allCount}</span>
            `;
            allTab.onclick = () => this.setTagFilter('all');
            this.historyFilterTabs.appendChild(allTab);
        }
        
        // Create tabs for each tag, but only if they have 1 or more completed tasks
        this.allTags.forEach(tag => {
            // Count completed tasks with this tag (case-insensitive)
            const tagCount = uniqueCompletedTasks.filter(task => 
                task.tags && task.tags.some(t => t.toLowerCase() === tag.name.toLowerCase())
            ).length;
            
            // Only create tab if count is 1 or more
            if (tagCount >= 1) {
                const tab = document.createElement('button');
                tab.className = `filter-tab ${this.selectedTagFilter === tag.name ? 'active' : ''}`;
                tab.dataset.filter = tag.name;
                tab.innerHTML = `
                    <span class="filter-tab-label">${tag.name}</span>
                    <span class="filter-tab-badge" style="background: ${tag.color}20; color: ${tag.color}">${tagCount}</span>
                `;
                tab.onclick = () => this.setTagFilter(tag.name);
                this.historyFilterTabs.appendChild(tab);
            }
        });
        
        // Show container if there are any completed tasks (even if all tabs are hidden)
        if (uniqueCompletedTasks.length > 0) {
            this.historyFilterTabsContainer.style.display = 'flex';
        } else {
            this.historyFilterTabsContainer.style.display = 'none';
        }
    }
    
    setTagFilter(tagName) {
        this.selectedTagFilter = tagName;
        this.renderFilterTabs();
        this.renderKanbanFilterTabs();
        this.renderHistoryFilterTabs();
        this.renderTasks();
        // Only render history if we're currently viewing it
        if (this.historyView && this.historyView.style.display !== 'none') {
            this.renderHistory();
        }
    }
}

// Initialize the timer when the page loads
let taskTimer;
document.addEventListener('DOMContentLoaded', () => {
    taskTimer = new TaskTimer();
});