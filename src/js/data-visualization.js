/**
 * Data Visualization Module
 * Provides advanced analytics charts and visualizations
 */

(function() {
    'use strict';

    const DataVisualization = {
        charts: {},
        initialized: false,

        init() {
            if (this.initialized) return;
            this.initialized = true;
            Logger.debug('DataVisualization initialized');
        },

        /**
         * Load the Data Visualization section
         */
        loadDataVisualizationSection() {
            const container = document.getElementById('bossDataVisualization');
            if (!container) return;

            container.innerHTML = `
                <div class="data-visualization-container">
                    <div class="viz-header">
                        <h2>📊 Data Visualization</h2>
                        <div class="viz-controls">
                            <select id="vizTimeRange" class="form-control">
                                <option value="7">Last 7 Days</option>
                                <option value="30" selected>Last 30 Days</option>
                                <option value="90">Last 90 Days</option>
                                <option value="365">Last Year</option>
                            </select>
                            <button onclick="DataVisualization.refreshAllCharts()" class="btn btn-primary">
                                🔄 Refresh
                            </button>
                        </div>
                    </div>

                    <!-- Stats Overview -->
                    <div class="viz-stats-grid">
                        <div class="viz-stat-card">
                            <div class="viz-stat-icon">📅</div>
                            <div class="viz-stat-content">
                                <div class="viz-stat-value" id="vizTotalShifts">0</div>
                                <div class="viz-stat-label">Total Shifts</div>
                            </div>
                        </div>
                        <div class="viz-stat-card">
                            <div class="viz-stat-icon">⏱️</div>
                            <div class="viz-stat-content">
                                <div class="viz-stat-value" id="vizTotalHours">0</div>
                                <div class="viz-stat-label">Total Hours</div>
                            </div>
                        </div>
                        <div class="viz-stat-card">
                            <div class="viz-stat-icon">👥</div>
                            <div class="viz-stat-content">
                                <div class="viz-stat-value" id="vizActiveStaff">0</div>
                                <div class="viz-stat-label">Active Staff</div>
                            </div>
                        </div>
                        <div class="viz-stat-card">
                            <div class="viz-stat-icon">💰</div>
                            <div class="viz-stat-content">
                                <div class="viz-stat-value" id="vizTotalCost">$0</div>
                                <div class="viz-stat-label">Total Cost</div>
                            </div>
                        </div>
                    </div>

                    <!-- Charts Grid -->
                    <div class="viz-charts-grid">
                        <!-- Staff Utilization Chart -->
                        <div class="viz-chart-card">
                            <h3>📈 Staff Utilization</h3>
                            <canvas id="staffUtilizationChart" height="300"></canvas>
                        </div>

                        <!-- Shift Distribution Heat Map -->
                        <div class="viz-chart-card">
                            <h3>🔥 Shift Distribution Heat Map</h3>
                            <div id="shiftHeatMap" class="shift-heatmap"></div>
                        </div>

                        <!-- Cost Analysis Chart -->
                        <div class="viz-chart-card">
                            <h3>💵 Cost Analysis</h3>
                            <canvas id="costAnalysisChart" height="300"></canvas>
                        </div>

                        <!-- Busy Periods Chart -->
                        <div class="viz-chart-card">
                            <h3>⏰ Busy Periods</h3>
                            <canvas id="busyPeriodsChart" height="300"></canvas>
                        </div>

                        <!-- Staff Performance Chart -->
                        <div class="viz-chart-card">
                            <h3>🏆 Staff Performance</h3>
                            <canvas id="staffPerformanceChart" height="300"></canvas>
                        </div>

                        <!-- Shift Type Trends -->
                        <div class="viz-chart-card">
                            <h3>📊 Shift Type Trends</h3>
                            <canvas id="shiftTypeTrendsChart" height="300"></canvas>
                        </div>
                    </div>
                </div>
            `;

            // Initialize all charts
            this.initCharts();
        },

        /**
         * Initialize all charts
         */
        initCharts() {
            this.updateStats();
            this.renderStaffUtilizationChart();
            this.renderShiftHeatMap();
            this.renderCostAnalysisChart();
            this.renderBusyPeriodsChart();
            this.renderStaffPerformanceChart();
            this.renderShiftTypeTrendsChart();

            // Add event listener for time range change
            const timeRangeSelect = document.getElementById('vizTimeRange');
            if (timeRangeSelect) {
                timeRangeSelect.addEventListener('change', () => {
                    this.refreshAllCharts();
                });
            }
        },

        /**
         * Update statistics cards
         */
        updateStats() {
            const schedules = JSON.parse(localStorage.getItem('lifestarSchedules') || '[]');
            const users = JSON.parse(localStorage.getItem('lifestarUsers') || '[]');
            const timeRange = parseInt(document.getElementById('vizTimeRange')?.value || '30');

            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - timeRange);

            let totalShifts = 0;
            let totalHours = 0;
            let totalCost = 0;

            schedules.forEach(schedule => {
                if (schedule.status !== 'published') return;
                
                const scheduleDate = new Date(schedule.date);
                if (scheduleDate < cutoffDate) return;

                if (schedule.crews) {
                    schedule.crews.forEach(crew => {
                        totalShifts++;
                        const hours = this.getShiftHours(crew.shiftType);
                        totalHours += hours;

                        const user = users.find(u => u.id === crew.userId);
                        if (user) {
                            const rate = this.getHourlyRate(user.role);
                            totalCost += hours * rate;
                        }
                    });
                }
            });

            const activeStaff = users.filter(u => u.role === 'paramedic' || u.role === 'emt').length;

            document.getElementById('vizTotalShifts').textContent = totalShifts;
            document.getElementById('vizTotalHours').textContent = totalHours.toFixed(1);
            document.getElementById('vizActiveStaff').textContent = activeStaff;
            document.getElementById('vizTotalCost').textContent = '$' + totalCost.toLocaleString();
        },

        /**
         * Get hours for shift type
         */
        getShiftHours(shiftType) {
            const hoursMap = {
                'day': 8,
                'night': 12,
                'evening': 8,
                '24-hour': 24,
                'overtime': 4
            };
            return hoursMap[shiftType] || 8;
        },

        /**
         * Get hourly rate for role
         */
        getHourlyRate(role) {
            const rateMap = {
                'paramedic': 35,
                'emt': 25
            };
            return rateMap[role] || 30;
        },

        /**
         * Render Staff Utilization Chart
         */
        renderStaffUtilizationChart() {
            const canvas = document.getElementById('staffUtilizationChart');
            if (!canvas || typeof Chart === 'undefined') return;

            const schedules = JSON.parse(localStorage.getItem('lifestarSchedules') || '[]');
            const users = JSON.parse(localStorage.getItem('lifestarUsers') || '[]');
            const timeRange = parseInt(document.getElementById('vizTimeRange')?.value || '30');

            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - timeRange);

            const staffData = {};
            users.filter(u => u.role === 'paramedic' || u.role === 'emt').forEach(user => {
                staffData[user.id] = {
                    name: user.name,
                    shifts: 0,
                    hours: 0
                };
            });

            schedules.forEach(schedule => {
                if (schedule.status !== 'published') return;
                
                const scheduleDate = new Date(schedule.date);
                if (scheduleDate < cutoffDate) return;

                if (schedule.crews) {
                    schedule.crews.forEach(crew => {
                        if (staffData[crew.userId]) {
                            staffData[crew.userId].shifts++;
                            staffData[crew.userId].hours += this.getShiftHours(crew.shiftType);
                        }
                    });
                }
            });

            const labels = Object.values(staffData).map(s => s.name);
            const shiftsData = Object.values(staffData).map(s => s.shifts);
            const hoursData = Object.values(staffData).map(s => s.hours);

            if (this.charts.staffUtilization) {
                this.charts.staffUtilization.destroy();
            }

            this.charts.staffUtilization = new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Shifts',
                            data: shiftsData,
                            backgroundColor: 'rgba(54, 162, 235, 0.8)',
                            borderColor: 'rgba(54, 162, 235, 1)',
                            borderWidth: 1,
                            yAxisID: 'y'
                        },
                        {
                            label: 'Hours',
                            data: hoursData,
                            backgroundColor: 'rgba(255, 99, 132, 0.8)',
                            borderColor: 'rgba(255, 99, 132, 1)',
                            borderWidth: 1,
                            yAxisID: 'y1'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    interaction: {
                        mode: 'index',
                        intersect: false
                    },
                    scales: {
                        y: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            title: {
                                display: true,
                                text: 'Shifts'
                            }
                        },
                        y1: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            title: {
                                display: true,
                                text: 'Hours'
                            },
                            grid: {
                                drawOnChartArea: false
                            }
                        }
                    }
                }
            });
        },

        /**
         * Render Shift Distribution Heat Map
         */
        renderShiftHeatMap() {
            const container = document.getElementById('shiftHeatMap');
            if (!container) return;

            const schedules = JSON.parse(localStorage.getItem('lifestarSchedules') || '[]');
            const timeRange = parseInt(document.getElementById('vizTimeRange')?.value || '30');

            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - timeRange);

            // Initialize heat map data (days of week x hours of day)
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const hours = Array.from({length: 24}, (_, i) => i);
            const heatMapData = {};

            days.forEach(day => {
                heatMapData[day] = {};
                hours.forEach(hour => {
                    heatMapData[day][hour] = 0;
                });
            });

            // Populate heat map data
            schedules.forEach(schedule => {
                if (schedule.status !== 'published') return;
                
                const scheduleDate = new Date(schedule.date);
                if (scheduleDate < cutoffDate) return;

                const dayOfWeek = days[scheduleDate.getDay()];
                
                if (schedule.crews) {
                    schedule.crews.forEach(crew => {
                        const shiftHours = this.getShiftHoursForHeatMap(crew.shiftType);
                        shiftHours.forEach(hour => {
                            if (heatMapData[dayOfWeek] && heatMapData[dayOfWeek][hour] !== undefined) {
                                heatMapData[dayOfWeek][hour]++;
                            }
                        });
                    });
                }
            });

            // Find max value for color scaling
            let maxValue = 0;
            Object.values(heatMapData).forEach(dayData => {
                Object.values(dayData).forEach(value => {
                    if (value > maxValue) maxValue = value;
                });
            });

            // Render heat map
            let html = '<div class="heatmap-grid">';
            
            // Header row with hours
            html += '<div class="heatmap-cell heatmap-header"></div>';
            hours.forEach(hour => {
                html += `<div class="heatmap-cell heatmap-header">${hour}</div>`;
            });

            // Data rows
            days.forEach(day => {
                html += `<div class="heatmap-cell heatmap-header">${day}</div>`;
                hours.forEach(hour => {
                    const value = heatMapData[day][hour] || 0;
                    const intensity = maxValue > 0 ? value / maxValue : 0;
                    const color = this.getHeatMapColor(intensity);
                    html += `<div class="heatmap-cell" style="background-color: ${color}; color: ${intensity > 0.5 ? 'white' : 'black'}" title="${day} ${hour}:00 - ${value} shifts">${value}</div>`;
                });
            });

            html += '</div>';

            // Add legend
            html += '<div class="heatmap-legend">';
            html += '<span>Low</span>';
            html += '<div class="heatmap-legend-bar"></div>';
            html += '<span>High</span>';
            html += '</div>';

            container.textContent = html;
        },

        /**
         * Get hours for heat map based on shift type
         */
        getShiftHoursForHeatMap(shiftType) {
            const hourMap = {
                'day': [8, 9, 10, 11, 12, 13, 14, 15],
                'night': [20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6, 7],
                'evening': [16, 17, 18, 19, 20, 21, 22, 23],
                '24-hour': Array.from({length: 24}, (_, i) => i),
                'overtime': [0, 1, 2, 3]
            };
            return hourMap[shiftType] || [8, 9, 10, 11, 12, 13, 14, 15];
        },

        /**
         * Get color for heat map based on intensity
         */
        getHeatMapColor(intensity) {
            // Color scale from light blue to dark red
            if (intensity === 0) return '#f5f5f5';
            if (intensity < 0.2) return '#e3f2fd';
            if (intensity < 0.4) return '#90caf9';
            if (intensity < 0.6) return '#42a5f5';
            if (intensity < 0.8) return '#ef5350';
            return '#c62828';
        },

        /**
         * Render Cost Analysis Chart
         */
        renderCostAnalysisChart() {
            const canvas = document.getElementById('costAnalysisChart');
            if (!canvas || typeof Chart === 'undefined') return;

            const schedules = JSON.parse(localStorage.getItem('lifestarSchedules') || '[]');
            const users = JSON.parse(localStorage.getItem('lifestarUsers') || '[]');
            const timeRange = parseInt(document.getElementById('vizTimeRange')?.value || '30');

            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - timeRange);

            // Group costs by week
            const weeklyCosts = {};
            const weeks = [];

            schedules.forEach(schedule => {
                if (schedule.status !== 'published') return;
                
                const scheduleDate = new Date(schedule.date);
                if (scheduleDate < cutoffDate) return;

                const weekKey = this.getWeekKey(scheduleDate);
                if (!weeklyCosts[weekKey]) {
                    weeklyCosts[weekKey] = 0;
                    weeks.push(weekKey);
                }

                if (schedule.crews) {
                    schedule.crews.forEach(crew => {
                        const hours = this.getShiftHours(crew.shiftType);
                        const user = users.find(u => u.id === crew.userId);
                        if (user) {
                            const rate = this.getHourlyRate(user.role);
                            weeklyCosts[weekKey] += hours * rate;
                        }
                    });
                }
            });

            weeks.sort();
            const labels = weeks.map(w => {
                const [year, week] = w.split('-W');
                return `W${week}`;
            });
            const data = weeks.map(w => weeklyCosts[w]);

            if (this.charts.costAnalysis) {
                this.charts.costAnalysis.destroy();
            }

            this.charts.costAnalysis = new Chart(canvas, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Weekly Cost',
                        data: data,
                        borderColor: 'rgba(75, 192, 192, 1)',
                        backgroundColor: 'rgba(75, 192, 192, 0.2)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return '$' + value.toLocaleString();
                                }
                            }
                        }
                    }
                }
            });
        },

        /**
         * Get week key for date
         */
        getWeekKey(date) {
            const year = date.getFullYear();
            const week = this.getWeekNumber(date);
            return `${year}-W${week}`;
        },

        /**
         * Get week number for date
         */
        getWeekNumber(date) {
            const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
            const dayNum = d.getUTCDay() || 7;
            d.setUTCDate(d.getUTCDate() + 4 - dayNum);
            const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
            return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        },

        /**
         * Render Busy Periods Chart
         */
        renderBusyPeriodsChart() {
            const canvas = document.getElementById('busyPeriodsChart');
            if (!canvas || typeof Chart === 'undefined') return;

            const schedules = JSON.parse(localStorage.getItem('lifestarSchedules') || '[]');
            const timeRange = parseInt(document.getElementById('vizTimeRange')?.value || '30');

            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - timeRange);

            // Group shifts by day
            const dailyShifts = {};
            const dates = [];

            schedules.forEach(schedule => {
                if (schedule.status !== 'published') return;
                
                const scheduleDate = new Date(schedule.date);
                if (scheduleDate < cutoffDate) return;

                const dateKey = scheduleDate.toISOString().split('T')[0];
                if (!dailyShifts[dateKey]) {
                    dailyShifts[dateKey] = 0;
                    dates.push(dateKey);
                }

                if (schedule.crews) {
                    dailyShifts[dateKey] += schedule.crews.length;
                }
            });

            dates.sort();
            const labels = dates.map(d => {
                const date = new Date(d);
                return `${date.getMonth() + 1}/${date.getDate()}`;
            });
            const data = dates.map(d => dailyShifts[d]);

            if (this.charts.busyPeriods) {
                this.charts.busyPeriods.destroy();
            }

            this.charts.busyPeriods = new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Shifts per Day',
                        data: data,
                        backgroundColor: 'rgba(255, 159, 64, 0.8)',
                        borderColor: 'rgba(255, 159, 64, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Number of Shifts'
                            }
                        }
                    }
                }
            });
        },

        /**
         * Render Staff Performance Chart
         */
        renderStaffPerformanceChart() {
            const canvas = document.getElementById('staffPerformanceChart');
            if (!canvas || typeof Chart === 'undefined') return;

            const schedules = JSON.parse(localStorage.getItem('lifestarSchedules') || '[]');
            const users = JSON.parse(localStorage.getItem('lifestarUsers') || '[]');
            const timeRange = parseInt(document.getElementById('vizTimeRange')?.value || '30');

            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - timeRange);

            const staffData = {};
            users.filter(u => u.role === 'paramedic' || u.role === 'emt').forEach(user => {
                staffData[user.id] = {
                    name: user.name,
                    shifts: 0,
                    onTime: 0,
                    overtime: 0
                };
            });

            schedules.forEach(schedule => {
                if (schedule.status !== 'published') return;
                
                const scheduleDate = new Date(schedule.date);
                if (scheduleDate < cutoffDate) return;

                if (schedule.crews) {
                    schedule.crews.forEach(crew => {
                        if (staffData[crew.userId]) {
                            staffData[crew.userId].shifts++;
                            if (crew.shiftType === 'overtime') {
                                staffData[crew.userId].overtime++;
                            } else {
                                staffData[crew.userId].onTime++;
                            }
                        }
                    });
                }
            });

            const labels = Object.values(staffData).map(s => s.name);
            const onTimeData = Object.values(staffData).map(s => s.onTime);
            const overtimeData = Object.values(staffData).map(s => s.overtime);

            if (this.charts.staffPerformance) {
                this.charts.staffPerformance.destroy();
            }

            this.charts.staffPerformance = new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'On-Time Shifts',
                            data: onTimeData,
                            backgroundColor: 'rgba(75, 192, 192, 0.8)',
                            borderColor: 'rgba(75, 192, 192, 1)',
                            borderWidth: 1
                        },
                        {
                            label: 'Overtime Shifts',
                            data: overtimeData,
                            backgroundColor: 'rgba(255, 99, 132, 0.8)',
                            borderColor: 'rgba(255, 99, 132, 1)',
                            borderWidth: 1
                        }
                    ]
                },
                options: {
                    responsive: true,
                    scales: {
                        x: {
                            stacked: true
                        },
                        y: {
                            stacked: true,
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Shifts'
                            }
                        }
                    }
                }
            });
        },

        /**
         * Render Shift Type Trends Chart
         */
        renderShiftTypeTrendsChart() {
            const canvas = document.getElementById('shiftTypeTrendsChart');
            if (!canvas || typeof Chart === 'undefined') return;

            const schedules = JSON.parse(localStorage.getItem('lifestarSchedules') || '[]');
            const timeRange = parseInt(document.getElementById('vizTimeRange')?.value || '30');

            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - timeRange);

            // Group shifts by type
            const shiftTypeData = {
                'day': 0,
                'night': 0,
                'evening': 0,
                '24-hour': 0,
                'overtime': 0
            };

            schedules.forEach(schedule => {
                if (schedule.status !== 'published') return;
                
                const scheduleDate = new Date(schedule.date);
                if (scheduleDate < cutoffDate) return;

                if (schedule.crews) {
                    schedule.crews.forEach(crew => {
                        if (shiftTypeData[crew.shiftType] !== undefined) {
                            shiftTypeData[crew.shiftType]++;
                        }
                    });
                }
            });

            const labels = Object.keys(shiftTypeData).map(t => t.charAt(0).toUpperCase() + t.slice(1));
            const data = Object.values(shiftTypeData);
            const colors = [
                'rgba(76, 175, 80, 0.8)',
                'rgba(33, 150, 243, 0.8)',
                'rgba(255, 152, 0, 0.8)',
                'rgba(156, 39, 176, 0.8)',
                'rgba(244, 67, 54, 0.8)'
            ];

            if (this.charts.shiftTypeTrends) {
                this.charts.shiftTypeTrends.destroy();
            }

            this.charts.shiftTypeTrends = new Chart(canvas, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: data,
                        backgroundColor: colors,
                        borderColor: colors.map(c => c.replace('0.8', '1')),
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            position: 'right'
                        }
                    }
                }
            });
        },

        /**
         * Refresh all charts
         */
        refreshAllCharts() {
            this.updateStats();
            this.renderStaffUtilizationChart();
            this.renderShiftHeatMap();
            this.renderCostAnalysisChart();
            this.renderBusyPeriodsChart();
            this.renderStaffPerformanceChart();
            this.renderShiftTypeTrendsChart();
        }
    };

    // Export to global scope
    window.DataVisualization = DataVisualization;
})();