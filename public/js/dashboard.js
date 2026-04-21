
document.addEventListener("DOMContentLoaded", function () {
    // Access global data
    const data = window.DashboardData || {};

    // 1. REGISTER PLUGINS
    if (typeof ChartDataLabels !== 'undefined') Chart.register(ChartDataLabels);
    if (typeof ChartZoom !== 'undefined') Chart.register(ChartZoom);
    if (typeof window['chartjs-plugin-annotation'] !== 'undefined') Chart.register(window['chartjs-plugin-annotation']);

    // Define Global Variables for DrillDown
    const hourlyProfiles = data.hourlyProfiles || {};
    const dayOfWeekComposition = data.dayOfWeekComposition || {};
    const dayLabels = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
    const hourLabels = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0') + ':00');

    let drillDownChartInstance = null;
    let modalCompositionChartInstance = null;
    let eventDrillDownChartInstance = null;
    let eventModalCompositionChartInstance = null;

    // Custom Crosshair Plugin
    const crosshairPlugin = {
        id: 'crosshair',
        defaults: { width: 1, color: '#94a3b8', dash: [3, 3] },
        afterInit: (chart) => { chart.crosshair = { x: 0, y: 0 }; },
        afterEvent: (chart, args) => {
            const { inChartArea } = args;
            const { x, y } = args.event;
            chart.crosshair = { x, y, draw: inChartArea };
            chart.draw();
        },
        afterDatasetsDraw: (chart, args, options) => {
            const { ctx, chartArea: { top, bottom } } = chart;
            const { x, draw } = chart.crosshair;
            if (!draw) return;

            const activeElements = chart.getActiveElements();
            if (activeElements.length === 0) return;

            const lineX = activeElements[0].element.x;
            ctx.save();
            ctx.beginPath();
            ctx.lineWidth = options.width;
            ctx.strokeStyle = options.color;
            ctx.setLineDash(options.dash);
            ctx.moveTo(lineX, top);
            ctx.lineTo(lineX, bottom);
            ctx.stroke();
            ctx.restore();
        }
    };
    Chart.register(crosshairPlugin);

    // 2. COMMON CONFIG & HELPERS
    const COLOR_PRIMARY = '#1F3C88';
    const COLOR_SECONDARY = '#FDBE33';

    const createGradient = (ctx, colorStart, colorEnd) => {
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, colorStart);
        gradient.addColorStop(1, colorEnd);
        return gradient;
    };

    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        hover: { mode: 'index', intersect: false },
        plugins: {
            legend: { labels: { font: { family: "'Poppins', sans-serif", size: 12 }, usePointStyle: true, boxWidth: 8, padding: 20 } },
            tooltip: {
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                titleColor: '#1e293b',
                bodyColor: '#64748b',
                borderColor: 'rgba(255, 255, 255, 0.5)',
                borderWidth: 1,
                padding: 12,
                cornerRadius: 16,
                displayColors: true,
                callbacks: { labelTextColor: function (context) { return '#64748b'; } }
            },
            datalabels: { display: false },
            zoom: {
                pan: { enabled: true, mode: 'x' },
                zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }
            },
            annotation: { annotations: {} }
        },
        scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(226, 232, 240, 0.6)', borderDash: [4, 4] }, border: { display: false }, ticks: { font: { family: "'Outfit', sans-serif", size: 11 } } },
            x: { grid: { display: false }, border: { display: false }, ticks: { font: { family: "'Outfit', sans-serif", size: 11 } } }
        },
        elements: {
            line: { tension: 0.4 },
            point: { radius: 0, hitRadius: 30, hoverRadius: 8 },
            bar: { borderRadius: { topLeft: 8, topRight: 8 } }
        }
    };

    const withDataLabels = (options) => {
        return {
            ...options,
            plugins: {
                ...options.plugins,
                datalabels: {
                    display: 'auto',
                    align: 'top',
                    anchor: 'end',
                    offset: 4,
                    backgroundColor: 'rgba(255, 255, 255, 0.6)',
                    backdropBlur: 4,
                    borderRadius: 6,
                    color: '#475569',
                    font: { family: "'Outfit', sans-serif", size: 11, weight: 'bold' },
                    formatter: (value) => value > 0 ? value.toLocaleString() : '',
                    padding: 4
                }
            }
        };
    };

    // 3. INITIALIZE CHARTS

    // --- Trend Chart ---
    const ctxTrend = document.getElementById('trendChart');
    if (ctxTrend) {
        const ctx = ctxTrend.getContext('2d');
        const trendData = data.chartTrend || {};
        const events = data.events || [];
        const labelType = data.labelType;
        const currentMonth = data.month;
        const currentYear = data.year;

        const getLabelDate = (label, index) => {
            if (labelType === 'monthly') {
                return new Date(Date.parse("1 " + label));
            } else {
                return new Date(currentYear, currentMonth - 1, parseInt(label));
            }
        };

        const annotations = {};

        // Helper to Show Event Modal
        const showEventModal = (event, startIndex, endIndex) => {
            let totalVal = event.total || '-';
            let avgVal = event.avg || '-';
            let maxVal = event.peak || '-';
            let peakDateLabel = event.peakDate || '-';

            const opts = { day: 'numeric', month: 'long', year: 'numeric' };
            const startStr = new Date(event.start).toLocaleDateString('id-ID', opts);
            const endStr = new Date(event.end).toLocaleDateString('id-ID', opts);

            const elTitle = document.getElementById('eventModalTitle');
            if (elTitle) elTitle.innerText = event.name;
            const elDate = document.getElementById('eventModalDate');
            if (elDate) elDate.innerText = `${startStr} - ${endStr}`;

            const elTotal = document.getElementById('eventModalTotal');
            if (elTotal) elTotal.innerText = totalVal;
            const elAvg = document.getElementById('eventModalAvg');
            if (elAvg) elAvg.innerText = avgVal;

            const elPeakDate = document.getElementById('eventModalPeakDate');
            if (elPeakDate) elPeakDate.innerText = peakDateLabel;
            const elPeakVal = document.getElementById('eventModalPeakVal');
            if (elPeakVal) elPeakVal.innerText = maxVal;

            const modal = document.getElementById('eventDetailModal');
            if (modal) {
                const deleteForm = document.getElementById('deleteEventForm');
                if (deleteForm && event.id) {
                    deleteForm.action = `/dashboard/events/${event.id}`;
                    deleteForm.classList.remove('hidden');
                } else if (deleteForm) {
                    deleteForm.classList.add('hidden');
                }

                // Reset CSS animation states
                const evPanel = document.getElementById('eventModalPanel');
                const evBackdrop = document.getElementById('eventModalBackdrop');

                modal.classList.remove('hidden');

                // Force a browser reflow before adding animation classes
                void modal.offsetWidth;

                if (evBackdrop) evBackdrop.classList.remove('opacity-0');
                if (evPanel) {
                    evPanel.classList.remove('scale-95', 'opacity-0');
                    evPanel.classList.add('scale-100', 'opacity-100');
                }
            }

            // --- Populate Time Distribution Bars & Hourly Chart ---
            let profileData = event.hourly_data || new Array(24).fill(0);
            const totalDaily = profileData.reduce((a, b) => a + b, 0);
            
            const calcSum = (start, end) => profileData.slice(start, end).reduce((a, b) => a + b, 0);
            const volMalam = calcSum(0, 6);
            const volPagi = calcSum(6, 12);
            const volSiang = calcSum(12, 18);
            const volSore = calcSum(18, 24);

            const updateBar = (idVal, idBar, val, total) => {
                const pct = total > 0 ? (val / total) * 100 : 0;
                const elVal = document.getElementById(idVal);
                const elBar = document.getElementById(idBar);
                if (elVal) elVal.innerText = `${val} (${Math.round(pct)}%)`;
                if (elBar) elBar.style.width = `${pct}%`;
            };

            updateBar('eventStatPagiVal', 'eventStatPagiBar', volPagi, totalDaily);
            updateBar('eventStatSiangVal', 'eventStatSiangBar', volSiang, totalDaily);
            updateBar('eventStatSoreVal', 'eventStatSoreBar', volSore, totalDaily);
            updateBar('eventStatMalamVal', 'eventStatMalamBar', volMalam, totalDaily);

            // Busiest 3 Hours
            const top3 = profileData
                .map((val, idx) => ({ hour: hourLabels[idx], val }))
                .sort((a, b) => b.val - a.val)
                .slice(0, 3);

            const top3HTML = top3.map((item, i) =>
                `<div class="flex justify-between items-center py-2 border-b border-slate-200 last:border-0 border-r-0 sm:border-r sm:last:border-r-0 pr-0 sm:pr-4 border-rose-100">
                    <div class="flex items-center gap-2">
                        <span class="w-6 h-6 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-xs font-bold">${i + 1}</span>
                        <span class="text-slate-600 font-medium text-xs">${item.hour}</span>
                    </div>
                    <span class="font-bold text-slate-800 text-sm">${item.val} <span class="text-[10px] font-normal text-slate-400">Pnb</span></span>
                </div>`
            ).join('');
            const listContainer = document.getElementById('eventModalTop3List');
            if (listContainer) listContainer.innerHTML = top3HTML;

            // Hourly Profile Chart
            const ctxDD = document.getElementById('eventDrillDownChart')?.getContext('2d');
            if (ctxDD) {
                if (eventDrillDownChartInstance) eventDrillDownChartInstance.destroy();
                const gradientDD = createGradient(ctxDD, 'rgba(59, 130, 246, 0.5)', 'rgba(59, 130, 246, 0.0)');

                eventDrillDownChartInstance = new Chart(ctxDD, {
                    type: 'line',
                    data: {
                        labels: hourLabels,
                        datasets: [{
                            label: 'Rata-rata Pergerakan',
                            data: profileData,
                            borderColor: '#3b82f6', backgroundColor: gradientDD, borderWidth: 3, fill: true, pointBackgroundColor: '#fff', pointBorderColor: '#3b82f6', pointRadius: 4, tension: 0.4
                        }]
                    },
                    options: {
                        ...commonOptions,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false }, zoom: { pan: { enabled: false }, zoom: { wheel: { enabled: false } } } },
                        scales: { y: { beginAtZero: true, grid: { color: 'rgba(226, 232, 240, 0.5)' } }, x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } } }
                    }
                });
            }

            // Composition Donut Chart
            let domVal = event.composition?.dom || 0;
            let intVal = event.composition?.int || 0;
            let trainVal = event.composition?.training || 0;
            
            // Normalize slightly to exactly match totalDaily if there's rounding difference
            const rawTotalComp = domVal + intVal + trainVal;
            if (rawTotalComp > 0 && totalDaily > 0) {
                const scaleComp = totalDaily / rawTotalComp;
                domVal = Math.round(domVal * scaleComp);
                intVal = Math.round(intVal * scaleComp);
                trainVal = totalDaily - domVal - intVal;
                if (trainVal < 0) { trainVal = 0; intVal = totalDaily - domVal; if (intVal < 0) { intVal = 0; domVal = totalDaily; } }
            }

            const totalEl = document.getElementById('eventModalCompTotal');
            if (totalEl) totalEl.innerText = totalDaily.toLocaleString();

            const ctxComp = document.getElementById('eventModalCompositionChart')?.getContext('2d');
            if (ctxComp) {
                if (eventModalCompositionChartInstance) eventModalCompositionChartInstance.destroy();
                eventModalCompositionChartInstance = new Chart(ctxComp, {
                    type: 'doughnut',
                    data: {
                        labels: ['Domestik', 'Internasional', 'Training'],
                        datasets: [{
                            data: [domVal, intVal, trainVal],
                            backgroundColor: ['#10b981', '#f59e0b', '#a855f7'],
                            borderWidth: 0,
                            hoverOffset: 4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        cutout: '75%',
                        plugins: { legend: { display: false }, datalabels: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${Math.round(c.raw)}` } } }
                    }
                });
            }
        };


        if (events.length > 0 && trendData.labels && trendData.labels.length > 0) {
            const chartDates = trendData.labels.map((lbl, idx) => ({
                index: idx,
                date: getLabelDate(lbl, idx)
            }));

            events.forEach((event, idx) => {
                const evtStart = new Date(event.start);
                const evtEnd = new Date(event.end);

                const firstDate = chartDates[0].date;
                const lastDate = chartDates[chartDates.length - 1].date;

                if (evtEnd < firstDate || evtStart > lastDate) return;

                let startIndex = -1;
                let endIndex = -1;

                if (labelType === 'monthly') {
                    const matchStart = chartDates.find(d =>
                        d.date.getFullYear() === evtStart.getFullYear() &&
                        d.date.getMonth() === evtStart.getMonth()
                    );
                    const matchEnd = chartDates.find(d =>
                        d.date.getFullYear() === evtEnd.getFullYear() &&
                        d.date.getMonth() === evtEnd.getMonth()
                    );

                    if (matchStart) startIndex = matchStart.index;
                    if (matchEnd) endIndex = matchEnd.index;
                } else {
                    const matches = chartDates.filter(d => d.date >= evtStart && d.date <= evtEnd);
                    if (matches.length > 0) {
                        startIndex = matches[0].index;
                        endIndex = matches[matches.length - 1].index;
                    }
                }

                if (startIndex !== -1) {
                    if (endIndex === -1) endIndex = chartDates[chartDates.length - 1].index;

                    annotations['event' + idx] = {
                        type: 'box',
                        xMin: startIndex - 0.4,
                        xMax: endIndex + 0.4,
                        backgroundColor: event.color,
                        borderColor: event.borderColor,
                        borderWidth: 1,
                        label: {
                            display: true,
                            content: event.name + " (Klik Detail)",
                            position: 'start',
                            color: '#64748b',
                            font: { size: 10, weight: 'bold' },
                            yAdjust: -20
                        },
                        click: function (context) {
                            showEventModal(event, startIndex, endIndex);
                        },
                        enter: function (context) {
                            context.chart.canvas.style.cursor = 'pointer';
                        },
                        leave: function (context) {
                            context.chart.canvas.style.cursor = 'default';
                        }
                    };
                }
            });
        }
        const getOptimalMax = (dataArray) => {
            const maxVal = dataArray && dataArray.length > 0 ? Math.max(...dataArray) : 0;
            if (maxVal === 0) return 10;
            if (maxVal <= 50) return Math.ceil(maxVal / 5) * 5 + 5; 
            if (maxVal <= 150) return Math.ceil(maxVal / 10) * 10 + 20; 
            return Math.ceil(maxVal / 10) * 10 + 50; 
        };

        const initialMax = getOptimalMax(trendData.data);
        const trendChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: trendData.labels,
                datasets: [
                    { label: 'Total Flights', data: trendData.data || [], borderColor: COLOR_PRIMARY, backgroundColor: createGradient(ctx, 'rgba(31, 60, 136, 0.2)', 'rgba(31, 60, 136, 0.0)'), borderWidth: 3, fill: true, pointBackgroundColor: '#fff', pointBorderColor: COLOR_PRIMARY, pointBorderWidth: 2 },
                    { label: 'Domestik', data: trendData.dom || [], borderColor: '#10b981', backgroundColor: createGradient(ctx, 'rgba(16, 185, 129, 0.2)', 'rgba(16, 185, 129, 0.0)'), borderWidth: 2, fill: true, pointBackgroundColor: '#fff', pointBorderColor: '#10b981', hidden: true },
                    { label: 'Internasional', data: trendData.int || [], borderColor: '#f59e0b', backgroundColor: createGradient(ctx, 'rgba(245, 158, 11, 0.2)', 'rgba(245, 158, 11, 0.0)'), borderWidth: 2, fill: true, pointBackgroundColor: '#fff', pointBorderColor: '#f59e0b', hidden: true },
                    { label: 'Training', data: trendData.training || [], borderColor: '#a855f7', backgroundColor: createGradient(ctx, 'rgba(168, 85, 247, 0.2)', 'rgba(168, 85, 247, 0.0)'), borderWidth: 2, fill: true, pointBackgroundColor: '#fff', pointBorderColor: '#a855f7', hidden: true }
                ]
            },
            options: withDataLabels({
                ...commonOptions,
                plugins: {
                    ...commonOptions.plugins,
                    legend: { display: false },
                    annotation: { annotations: annotations }
                },
                interaction: { mode: 'index', intersect: false },
                scales: {
                    ...commonOptions.scales,
                    y: {
                        ...commonOptions.scales.y,
                        max: initialMax
                    }
                }
            })
        });

        const trendButtons = ['total', 'dom', 'int', 'train'];
        trendButtons.forEach((type, index) => {
            const btn = document.getElementById(`btn-trend-${type}`);
            if (btn) {
                btn.addEventListener('click', () => {
                    trendChart.data.datasets.forEach((ds, i) => trendChart.setDatasetVisibility(i, i === index));
                    const activeDataset = trendChart.data.datasets[index].data;
                    trendChart.options.scales.y.max = getOptimalMax(activeDataset);
                    trendChart.update();
                    
                    trendButtons.forEach(t => {
                        const b = document.getElementById(`btn-trend-${t}`);
                        if (b) { b.classList.remove('active'); b.classList.add('inactive'); }
                    });
                    btn.classList.remove('inactive');
                    btn.classList.add('active');
                });
            }
        });
    }

    // --- Arr vs Dep Chart ---
    const ctxArrDep = document.getElementById('arrDepChart');
    if (ctxArrDep) {
        const adData = data.chartArrDep || {};

        const getOptimalMaxAd = (dataArray) => {
            const maxVal = dataArray && dataArray.length > 0 ? Math.max(...dataArray) : 0;
            if (maxVal === 0) return 10;
            if (maxVal <= 50) return Math.ceil(maxVal / 5) * 5 + 5; 
            if (maxVal <= 150) return Math.ceil(maxVal / 10) * 10 + 20; 
            return Math.ceil(maxVal / 10) * 10 + 50; 
        };

        const maxArr = adData.arr && adData.arr.length > 0 ? Math.max(...adData.arr) : 0;
        const maxDep = adData.dep && adData.dep.length > 0 ? Math.max(...adData.dep) : 0;
        const initialMaxAd = getOptimalMaxAd([maxArr, maxDep]);

        const arrDepChart = new Chart(ctxArrDep.getContext('2d'), {
            type: 'line',
            data: {
                labels: (data.chartTrend || {}).labels || [],
                datasets: [
                    { label: 'Arrival', data: adData.arr, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', borderWidth: 2, fill: true, pointBackgroundColor: '#fff', pointBorderColor: '#10b981', tension: 0.4 },
                    { label: 'Departure', data: adData.dep, borderColor: '#0ea5e9', backgroundColor: 'rgba(14, 165, 233, 0.1)', borderWidth: 2, borderDash: [5, 5], fill: true, pointBackgroundColor: '#fff', pointBorderColor: '#0ea5e9', tension: 0.4 }
                ]
            },
            options: withDataLabels({
                ...commonOptions,
                plugins: { ...commonOptions.plugins, legend: { position: 'top', align: 'end' } },
                interaction: { mode: 'index', intersect: false },
                scales: {
                    ...commonOptions.scales,
                    y: {
                        ...commonOptions.scales.y,
                        max: initialMaxAd
                    }
                }
            })
        });

        const adButtons = { 'all': [true, true], 'arr': [true, false], 'dep': [false, true] };
        Object.keys(adButtons).forEach(key => {
            const btn = document.getElementById(`btn-${key}`);
            if (btn) {
                btn.addEventListener('click', () => {
                    arrDepChart.setDatasetVisibility(0, adButtons[key][0]);
                    arrDepChart.setDatasetVisibility(1, adButtons[key][1]);
                    let activeData = [];
                    if (key === 'all') {
                        activeData = [Math.max(...(adData.arr || [0])), Math.max(...(adData.dep || [0]))];
                    } else if (key === 'arr') {
                        activeData = adData.arr || [];
                    } else if (key === 'dep') {
                        activeData = adData.dep || [];
                    }
                    arrDepChart.options.scales.y.max = getOptimalMaxAd(activeData);

                    arrDepChart.update();
                    Object.keys(adButtons).forEach(k => {
                        const b = document.getElementById(`btn-${k}`);
                        if (b) { b.classList.remove('active'); b.classList.add('inactive'); }
                    });
                    btn.classList.remove('inactive');
                    btn.classList.add('active');
                });
            }
        });
    }

    // --- Category Chart (Donut) ---
    const ctxCategory = document.getElementById('categoryChart');
    if (ctxCategory) {
        const catData = data.chartCategory || {};
        new Chart(ctxCategory.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['Domestik', 'Internasional', 'Training'],
                datasets: [{
                    data: [catData.dom, catData.int, catData.training],
                    backgroundColor: ['#10b981', '#f59e0b', '#a855f7'],
                    borderWidth: 0, hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '75%',
                plugins: { legend: { display: false }, datalabels: { display: false }, zoom: { pan: { enabled: false }, zoom: { wheel: { enabled: false } } } }
            }
        });
    }

    // --- Peak Hour Chart ---
    const ctxPeak = document.getElementById('peakChart');
    if (ctxPeak) {
        const peakData = data.peakHourfreq || {};
        const labels = Object.keys(peakData);
        const values = Object.values(peakData);

        const maxPeakVal = values.length ? Math.max(...values) : 1;
        const peakThreshold = maxPeakVal * 0.08; // only label bars > 8% of max

        new Chart(ctxPeak, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        type: 'line',
                        label: 'Trend',
                        data: values,
                        borderColor: '#f59e0b',
                        backgroundColor: 'transparent',
                        borderWidth: 2.5,
                        tension: 0.45,
                        pointRadius: 0,
                        pointHoverRadius: 6,
                        pointBackgroundColor: '#ffffff',
                        pointBorderColor: '#f59e0b',
                        pointBorderWidth: 2.5,
                        order: 0,
                        datalabels: { display: false }
                    },
                    {
                        type: 'bar',
                        label: 'Frekuensi',
                        data: values,
                        backgroundColor: (ctx) => {
                            const v = ctx.dataset.data[ctx.dataIndex];
                            const opacity = 0.35 + 0.65 * (v / maxPeakVal);
                            const chartCtx = ctx.chart.ctx;
                            const chartArea = ctx.chart.chartArea;
                            const top = chartArea ? chartArea.top : 0;
                            const bottom = chartArea ? chartArea.bottom : 200;
                            const grad = chartCtx.createLinearGradient(0, top, 0, bottom);
                            grad.addColorStop(0, `rgba(244, 63, 94, ${opacity.toFixed(2)})`);
                            grad.addColorStop(1, `rgba(159, 18, 57, ${opacity.toFixed(2)})`);
                            return grad;
                        },
                        borderRadius: 6,
                        clip: false,
                        order: 1,
                        barPercentage: 0.7,
                        categoryPercentage: 0.8
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 28, left: 4, right: 4, bottom: 4 } },
                plugins: {
                    legend: { display: false },
                    datalabels: {
                        color: '#64748b',
                        anchor: 'end',
                        align: 'top',
                        display: (c) => (c.dataset.data[c.dataIndex] || 0) >= peakThreshold,
                        font: { family: "'Outfit', sans-serif", size: 9, weight: 'bold' },
                        clamp: false
                    }
                },
                scales: {
                    y: {
                        display: true,
                        beginAtZero: true,
                        max: Math.ceil(maxPeakVal * 1.1 / 50) * 50,
                        border: { display: false },
                        grid: { color: 'rgba(148,163,184,0.12)', drawTicks: false },
                        ticks: {
                            font: { family: "'Outfit', sans-serif", size: 9 },
                            color: '#b0bec5',
                            padding: 4,
                            maxTicksLimit: 4,
                            callback: (v) => v === 0 ? '' : v
                        }
                    },
                    x: {
                        display: true,
                        grid: { display: false },
                        border: { display: false },
                        ticks: {
                            font: { family: "'Outfit', sans-serif", size: 10, weight: '600' },
                            color: '#64748b',
                            maxRotation: 0,
                            callback: (val, i) => i % 2 === 0 ? labels[i] : ''
                        }
                    }
                }
            }
        });
    }

    // --- Day of Week Chart (With Drill-Down) ---
    const ctxDay = document.getElementById('dayOfWeekChart');
    if (ctxDay) {
        const dayValues = data.dayOfWeekData || [];

        const minDayVal = dayValues.length ? Math.min(...dayValues) : 0;
        const maxDayVal = dayValues.length ? Math.max(...dayValues) : 1;
        const daySpread = maxDayVal - minDayVal;
        const yMin = Math.max(0, Math.floor(minDayVal - daySpread * 0.8));
        const yMax = Math.ceil(maxDayVal + daySpread * 0.5);

        new Chart(ctxDay, {
            type: 'bar',
            data: {
                labels: ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'],
                datasets: [
                    {
                        type: 'line',
                        label: 'Trend',
                        data: dayValues,
                        borderColor: '#f43f5e',
                        backgroundColor: 'transparent',
                        borderWidth: 3,
                        tension: 0.45,
                        pointRadius: 5,
                        pointHoverRadius: 8,
                        pointBackgroundColor: '#ffffff',
                        pointBorderColor: '#f43f5e',
                        pointBorderWidth: 2.5,
                        order: 0,
                        datalabels: { display: false }
                    },
                    {
                        type: 'bar',
                        label: 'Avg Flights',
                        data: dayValues,
                        backgroundColor: (ctx) => {
                            const chartCtx = ctx.chart.ctx;
                            const chartArea = ctx.chart.chartArea;
                            const top = chartArea ? chartArea.top : 0;
                            const bottom = chartArea ? chartArea.bottom : 300;
                            const grad = chartCtx.createLinearGradient(0, top, 0, bottom + 40);
                            if (ctx.dataIndex >= 5) {
                                grad.addColorStop(0, 'rgba(129, 140, 248, 0.95)');
                                grad.addColorStop(1, 'rgba(49, 46, 129, 0.95)');
                            } else {
                                grad.addColorStop(0, 'rgba(59, 130, 246, 0.95)');
                                grad.addColorStop(1, 'rgba(30, 58, 138, 0.95)');
                            }
                            return grad;
                        },
                        borderRadius: 8,
                        hoverBackgroundColor: COLOR_SECONDARY,
                        clip: true,
                        order: 1,
                        barPercentage: 0.7,
                        categoryPercentage: 0.8
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 30, bottom: 10 } },
                onHover: (event, chartElement) => {
                    event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default';
                },
                onClick: (event, elements) => {
                    if (elements.length > 0) {
                        openDrillDown(elements[0].index);
                    }
                },
                plugins: {
                    legend: { display: false },
                    datalabels: {
                        color: '#475569',
                        anchor: 'end',
                        align: 'top',
                        display: (c) => (c.dataset.data[c.dataIndex] || 0) > 0,
                        font: { family: "'Outfit', sans-serif", size: 11, weight: 'bold' },
                        formatter: (value) => Math.round(value).toLocaleString(),
                        clamp: false,
                        offset: 4
                    }
                },
                scales: {
                    y: {
                        display: true,
                        min: yMin,
                        max: yMax,
                        border: { display: false },
                        grid: { color: 'rgba(148,163,184,0.12)', drawTicks: false },
                        ticks: {
                            font: { family: "'Outfit', sans-serif", size: 10 },
                            color: '#b0bec5',
                            padding: 8,
                            maxTicksLimit: 4,
                            callback: (v) => v.toLocaleString()
                        }
                    },
                    x: {
                        display: true,
                        grid: { display: false, drawBorder: false },
                        border: { display: false },
                        ticks: {
                            font: { family: "'Outfit', sans-serif", size: 12, weight: '700' },
                            color: '#64748b',
                            padding: 8
                        }
                    }
                }
            }
        });
    }

    // Drill Down Modal Logic (ENHANCED)
    const modal = document.getElementById('drillDownModal');
    const modalBackdrop = document.getElementById('modalBackdrop');
    const modalPanel = document.getElementById('modalPanel');
    const closeModalBtns = [document.getElementById('closeModalBtn'), document.getElementById('closeModalBtnText')];

    function openDrillDown(dayIndex) {
        modal.classList.remove('hidden');
        const dayName = dayLabels[dayIndex];
        document.getElementById('modalDayName').innerText = dayName;

        // Reset the subtitle to the exact filtered data range
        const dataRangeLabel = document.getElementById('dataRangeLabel') ? document.getElementById('dataRangeLabel').innerText : '';
        document.getElementById('modalSubtitle').innerHTML = `Estimasi rata-rata pergerakan harian dari: <strong class="text-indigo-600">${dataRangeLabel}</strong>`;

        const profileData = data.hourlyProfiles[dayIndex + 1] || [];

        const totalDaily = profileData.reduce((a, b) => a + b, 0);
        const peakValue = Math.max(...profileData);
        const peakHourIndex = profileData.indexOf(peakValue);
        const peakHourFmt = hourLabels[peakHourIndex] || '-';

        document.getElementById('modalTotalFlights').innerText = totalDaily.toLocaleString();
        document.getElementById('modalPeakHour').innerText = peakHourFmt;

        const avgDaily = data.avgDailyFlights || 0;
        let status = 'Normal';
        let statusColor = 'text-emerald-600';
        if (totalDaily > avgDaily * 1.1) { status = 'Tinggi'; statusColor = 'text-rose-600'; }
        else if (totalDaily < avgDaily * 0.9) { status = 'Rendah'; statusColor = 'text-slate-500'; }

        const statusEl = document.getElementById('modalStatus');
        statusEl.innerText = status;
        statusEl.className = `text-lg font-bold ${statusColor}`;

        const calcSum = (start, end) => profileData.slice(start, end).reduce((a, b) => a + b, 0);

        const volMalam = calcSum(0, 6);
        const volPagi = calcSum(6, 12);
        const volSiang = calcSum(12, 18);
        const volSore = calcSum(18, 24);

        const updateBar = (idVal, idBar, val, total) => {
            const pct = total > 0 ? (val / total) * 100 : 0;
            document.getElementById(idVal).innerText = `${val} (${Math.round(pct)}%)`;
            document.getElementById(idBar).style.width = `${pct}%`;
        };

        updateBar('statPagiVal', 'statPagiBar', volPagi, totalDaily);
        updateBar('statSiangVal', 'statSiangBar', volSiang, totalDaily);
        updateBar('statSoreVal', 'statSoreBar', volSore, totalDaily);
        updateBar('statMalamVal', 'statMalamBar', volMalam, totalDaily);

        const top3 = profileData
            .map((val, idx) => ({ hour: hourLabels[idx], val }))
            .sort((a, b) => b.val - a.val)
            .slice(0, 3);

        const top3HTML = top3.map((item, i) =>
            `<div class="flex justify-between items-center py-2 border-b border-slate-200 last:border-0 border-r last:border-r-0 pr-4 last:pr-0 border-rose-100">
                <div class="flex items-center gap-2">
                    <span class="w-6 h-6 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-xs font-bold">${i + 1}</span>
                    <span class="text-slate-600 font-medium text-xs">${item.hour}</span>
                </div>
                <span class="font-bold text-slate-800 text-sm">${item.val} <span class="text-[10px] font-normal text-slate-400">Pnb</span></span>
            </div>`
        ).join('');
        const listContainer = document.getElementById('modalTop3List');
        if (listContainer) listContainer.innerHTML = top3HTML;

        // Hide Note Section since this is a composite visualization for Day of Week
        const modalNoteSection = document.getElementById('modalNoteSection');
        if (modalNoteSection) modalNoteSection.classList.add('hidden');

        const ctxDD = document.getElementById('drillDownChart').getContext('2d');
        if (drillDownChartInstance) drillDownChartInstance.destroy();

        const gradientDD = createGradient(ctxDD, 'rgba(244, 63, 94, 0.5)', 'rgba(244, 63, 94, 0.0)');

        drillDownChartInstance = new Chart(ctxDD, {
            type: 'line',
            data: {
                labels: hourLabels,
                datasets: [{
                    label: 'Pergerakan',
                    data: profileData,
                    borderColor: '#f43f5e', backgroundColor: gradientDD, borderWidth: 3, fill: true, pointBackgroundColor: '#fff', pointBorderColor: '#f43f5e', pointRadius: 4, tension: 0.4
                }]
            },
            options: {
                ...commonOptions,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, zoom: { pan: { enabled: false }, zoom: { wheel: { enabled: false } } } },
                scales: { y: { beginAtZero: true, grid: { color: 'rgba(226, 232, 240, 0.5)' } }, x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } } }
            }
        });

        const rawDomVal = dayOfWeekComposition?.dom?.[dayIndex + 1] || 0;
        const rawIntVal = dayOfWeekComposition?.int?.[dayIndex + 1] || 0;
        const rawTrainVal = dayOfWeekComposition?.training?.[dayIndex + 1] || 0;
        const rawTotalComp = rawDomVal + rawIntVal + rawTrainVal;

        // Sinkronisasi data komposisi dengan total profil jam (totalDaily) agar tidak ada discrepancy total
        const scaleComp = rawTotalComp > 0 ? (totalDaily / rawTotalComp) : 0;
        let domVal = Math.round(rawDomVal * scaleComp);
        let intVal = Math.round(rawIntVal * scaleComp);
        let trainVal = totalDaily - domVal - intVal;

        // Jika negative fallback (safety net)
        if (trainVal < 0) {
            trainVal = 0;
            intVal = totalDaily - domVal;
            if (intVal < 0) { intVal = 0; domVal = totalDaily; }
        }

        const totalEl = document.getElementById('modalCompTotal');
        if (totalEl) totalEl.innerText = totalDaily.toLocaleString();

        const ctxComp = document.getElementById('modalCompositionChart');
        if (ctxComp) {
            if (modalCompositionChartInstance) modalCompositionChartInstance.destroy();
            modalCompositionChartInstance = new Chart(ctxComp.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: ['Domestik', 'Internasional', 'Training'],
                    datasets: [{
                        data: [domVal, intVal, trainVal],
                        backgroundColor: ['#10b981', '#f59e0b', '#a855f7'],
                        borderWidth: 0,
                        hoverOffset: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '75%',
                    plugins: { legend: { display: false }, datalabels: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${Math.round(c.raw)}` } } }
                }
            });
        }

        void modal.offsetWidth;
        modalBackdrop.classList.remove('opacity-0');
        modalPanel.classList.remove('scale-95', 'opacity-0');
        modalPanel.classList.add('scale-100', 'opacity-100');
    }

    window.openHeatmapDrillDown = function (dateStr) {
        const d = (data.heatmapData || []).find(x => x.date === dateStr);
        if (!d || d.value === 0) return; // Ignore empty days

        modal.classList.remove('hidden');

        const dateObj = new Date(dateStr);
        const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        const dayName = dayNames[dateObj.getDay()];

        // Dynamically overwrite Subtitle for Heatmap specific drilldown
        document.getElementById('modalDayName').innerText = `${dayName}, ${dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`;
        document.getElementById('modalSubtitle').innerHTML = `Estimasi pergerakan rinci berdasarkan tanggal spesifik: <strong class="text-indigo-600">${dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>`;

        // Use Actual Hourly Data from the Database
        let profileData = d.hourly_data || new Array(24).fill(0);
        let peakHour = profileData.indexOf(Math.max(...profileData));
        if (peakHour === -1 || Math.max(...profileData) === 0) peakHour = d.peak_hour || 0; // Fallback to DB peak hour if array is empty

        // Modal Rendering Mapping
        const totalDaily = d.value;
        const peakValue = d.peak_count;
        const peakHourFmt = hourLabels[peakHour] || '-';

        document.getElementById('modalTotalFlights').innerText = totalDaily.toLocaleString();
        document.getElementById('modalPeakHour').innerText = peakHourFmt;

        const avgDaily = data.avgDailyFlights || 0;
        let status = 'Normal';
        let statusColor = 'text-emerald-600';
        if (totalDaily > avgDaily * 1.1) { status = 'Tinggi'; statusColor = 'text-rose-600'; }
        else if (totalDaily < avgDaily * 0.9) { status = 'Rendah'; statusColor = 'text-slate-500'; }

        const statusEl = document.getElementById('modalStatus');
        statusEl.innerText = status;
        statusEl.className = `text-lg font-bold ${statusColor}`;

        const calcSum = (start, end) => profileData.slice(start, end).reduce((a, b) => a + b, 0);

        const volMalam = calcSum(0, 6);
        const volPagi = calcSum(6, 12);
        const volSiang = calcSum(12, 18);
        const volSore = calcSum(18, 24);

        const updateBar = (idVal, idBar, val, total) => {
            const pct = total > 0 ? (val / total) * 100 : 0;
            document.getElementById(idVal).innerText = `${val} (${Math.round(pct)}%)`;
            document.getElementById(idBar).style.width = `${pct}%`;
        };

        updateBar('statPagiVal', 'statPagiBar', volPagi, totalDaily);
        updateBar('statSiangVal', 'statSiangBar', volSiang, totalDaily);
        updateBar('statSoreVal', 'statSoreBar', volSore, totalDaily);
        updateBar('statMalamVal', 'statMalamBar', volMalam, totalDaily);

        const top3 = profileData
            .map((val, idx) => ({ hour: hourLabels[idx], val }))
            .sort((a, b) => b.val - a.val)
            .slice(0, 3);

        const top3HTML = top3.map((item, i) =>
            `<div class="flex justify-between items-center py-2 border-b border-slate-200 last:border-0 border-r last:border-r-0 pr-4 last:pr-0 border-rose-100">
                <div class="flex items-center gap-2">
                    <span class="w-6 h-6 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-xs font-bold">${i + 1}</span>
                    <span class="text-slate-600 font-medium text-xs">${item.hour}</span>
                </div>
                <span class="font-bold text-slate-800 text-sm">${item.val} <span class="text-[10px] font-normal text-slate-400">Pnb</span></span>
            </div>`
        ).join('');
        const listContainer = document.getElementById('modalTop3List');
        if (listContainer) listContainer.innerHTML = top3HTML;

        // Show Note Section for specific date drilldowns
        const modalNoteSection = document.getElementById('modalNoteSection');
        if (modalNoteSection) modalNoteSection.classList.remove('hidden');

        // Fill Modal Note Form
        const noteInput = document.getElementById('modalInsightInput');
        const noteDate = document.getElementById('modalInsightDate');
        const noteBranch = document.getElementById('modalInsightBranch');
        const noteStatus = document.getElementById('saveNoteStatus');

        if (noteInput && noteDate && noteBranch) {
            noteDate.value = d.date; // Use specific current date
            noteBranch.value = d.branch_code || ''; // Fallback to avoid null
            noteInput.value = d.note || ''; // Default to empty instead of auto generated text
            if (noteStatus) noteStatus.classList.add('opacity-0'); // Hide success msg on open
        }

        const ctxDD = document.getElementById('drillDownChart').getContext('2d');
        if (drillDownChartInstance) drillDownChartInstance.destroy();

        const gradientDD = createGradient(ctxDD, 'rgba(244, 63, 94, 0.5)', 'rgba(244, 63, 94, 0.0)');

        drillDownChartInstance = new Chart(ctxDD, {
            type: 'line',
            data: {
                labels: hourLabels,
                datasets: [{
                    label: 'Pergerakan',
                    data: profileData,
                    borderColor: '#f43f5e', backgroundColor: gradientDD, borderWidth: 3, fill: true, pointBackgroundColor: '#fff', pointBorderColor: '#f43f5e', pointRadius: 4, tension: 0.4
                }]
            },
            options: {
                ...commonOptions,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, zoom: { pan: { enabled: false }, zoom: { wheel: { enabled: false } } } },
                scales: { y: { beginAtZero: true, grid: { color: 'rgba(226, 232, 240, 0.5)' } }, x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } } }
            }
        });

        const domVal = d.dom || 0;
        const intVal = d.int || 0;
        const trainVal = d.training || 0;

        const totalEl = document.getElementById('modalCompTotal');
        if (totalEl) totalEl.innerText = totalDaily.toLocaleString();

        const ctxComp = document.getElementById('modalCompositionChart');
        if (ctxComp) {
            if (modalCompositionChartInstance) modalCompositionChartInstance.destroy();
            modalCompositionChartInstance = new Chart(ctxComp.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: ['Domestik', 'Internasional', 'Training'],
                    datasets: [{
                        data: [domVal, intVal, trainVal],
                        backgroundColor: ['#10b981', '#f59e0b', '#a855f7'],
                        borderWidth: 0,
                        hoverOffset: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '75%',
                    plugins: { legend: { display: false }, datalabels: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${Math.round(c.raw)}` } } }
                }
            });
        }

        void modal.offsetWidth;
        modalBackdrop.classList.remove('opacity-0');
        modalPanel.classList.remove('scale-95', 'opacity-0');
        modalPanel.classList.add('scale-100', 'opacity-100');
    }

    function closeModal() {
        modalBackdrop.classList.add('opacity-0');
        modalPanel.classList.remove('scale-100', 'opacity-100');
        modalPanel.classList.add('scale-95', 'opacity-0');
        setTimeout(() => { modal.classList.add('hidden'); }, 300);
    }
    if (closeModalBtns) closeModalBtns.forEach(btn => { if (btn) btn.addEventListener('click', closeModal); });

    // modalBackdrop is z-0, but modalWrapper is z-10 and covers the screen.
    const modalWrapper = document.getElementById('modalWrapper');
    if (modalWrapper) {
        modalWrapper.addEventListener('click', (e) => {
            // Only close if clicking the wrapper itself directly (not the panel inside)
            if (e.target === modalWrapper) closeModal();
        });
    }

    // --- MODAL: Add Event ---
    const addEventModal = document.getElementById('addEventModal');
    const addEventPanel = document.getElementById('addEventPanel');
    const addEventBackdrop = document.getElementById('addEventBackdrop');
    const addEventWrapper = document.getElementById('addEventWrapper');
    const btnOpenAddEvent = document.getElementById('openAddEventBtn');
    const btnCloseAddEvent = document.getElementById('closeAddEventBtn');
    const btnCloseAddEventText = document.getElementById('closeAddEventBtnText');

    function openAddEventModal() {
        if (!addEventModal) return;
        addEventModal.classList.remove('hidden');
        // Force reflow
        void addEventPanel.offsetWidth;
        addEventBackdrop.classList.remove('opacity-0');
        addEventPanel.classList.remove('scale-95', 'opacity-0');
        addEventPanel.classList.add('scale-100', 'opacity-100');
    }

    function closeAddEventModal() {
        if (!addEventModal) return;
        addEventBackdrop.classList.add('opacity-0');
        addEventPanel.classList.remove('scale-100', 'opacity-100');
        addEventPanel.classList.add('scale-95', 'opacity-0');
        setTimeout(() => { addEventModal.classList.add('hidden'); }, 300);
    }

    if (btnOpenAddEvent) btnOpenAddEvent.addEventListener('click', openAddEventModal);
    if (btnCloseAddEvent) btnCloseAddEvent.addEventListener('click', closeAddEventModal);
    if (btnCloseAddEventText) btnCloseAddEventText.addEventListener('click', closeAddEventModal);

    if (addEventWrapper) {
        addEventWrapper.addEventListener('click', (e) => {
            if (e.target === addEventWrapper) closeAddEventModal();
        });
    }

    // --- MODAL: Event Detail & Delete Confirmation ---
    const btnCloseEventText = document.getElementById('closeEventModalBtnText');
    const deleteForm = document.getElementById('deleteEventForm');
    const triggerDeleteBtn = document.getElementById('triggerDeleteEventBtn');

    const deleteConfirmModal = document.getElementById('deleteConfirmModal');
    const deleteConfirmPanel = document.getElementById('deleteConfirmPanel');
    const deleteConfirmBackdrop = document.getElementById('deleteConfirmBackdrop');
    const deleteConfirmWrapper = document.getElementById('deleteConfirmWrapper');
    const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

    function closeEventDetailModal() {
        const evModal = document.getElementById('eventDetailModal');
        const evPanel = document.getElementById('eventModalPanel');
        const evBackdrop = document.getElementById('eventModalBackdrop');
        if (!evModal) return;

        if (evBackdrop) evBackdrop.classList.add('opacity-0');
        if (evPanel) {
            evPanel.classList.remove('scale-100', 'opacity-100');
            evPanel.classList.add('scale-95', 'opacity-0');
        }
        setTimeout(() => { evModal.classList.add('hidden'); }, 300);
    }

    if (btnCloseEventText) btnCloseEventText.addEventListener('click', closeEventDetailModal);
    const btnCloseEventIcon = document.getElementById('closeEventModalBtn');
    if (btnCloseEventIcon) btnCloseEventIcon.addEventListener('click', closeEventDetailModal);

    // Add backdrop click close listener
    const evBackdropGlobal = document.getElementById('eventModalBackdrop');
    if (evBackdropGlobal) evBackdropGlobal.addEventListener('click', closeEventDetailModal);

    // Replace default confirm() with Custom Modal
    if (triggerDeleteBtn && deleteConfirmModal) {
        triggerDeleteBtn.addEventListener('click', () => {
            // Hide the event detail modal temporarily to focus on confirmation
            const evModal = document.getElementById('eventDetailModal');
            if (evModal) evModal.classList.add('hidden');

            deleteConfirmModal.classList.remove('hidden');
            void deleteConfirmPanel.offsetWidth;
            deleteConfirmBackdrop.classList.remove('opacity-0');
            deleteConfirmPanel.classList.remove('scale-95', 'opacity-0');
            deleteConfirmPanel.classList.add('scale-100', 'opacity-100');
        });
    }

    function closeDeleteConfirmModal() {
        if (!deleteConfirmModal) return;
        deleteConfirmBackdrop.classList.add('opacity-0');
        deleteConfirmPanel.classList.remove('scale-100', 'opacity-100');
        deleteConfirmPanel.classList.add('scale-95', 'opacity-0');
        setTimeout(() => {
            deleteConfirmModal.classList.add('hidden');
            // Bring back the event detail modal if they cancel
            const evModal = document.getElementById('eventDetailModal');
            if (evModal) evModal.classList.remove('hidden');
        }, 300);
    }

    if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', closeDeleteConfirmModal);
    if (deleteConfirmWrapper) {
        deleteConfirmWrapper.addEventListener('click', (e) => {
            if (e.target === deleteConfirmWrapper) closeDeleteConfirmModal();
        });
    }

    if (confirmDeleteBtn && deleteForm) {
        confirmDeleteBtn.addEventListener('click', () => {
            // Add loading state
            confirmDeleteBtn.innerHTML = '<svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline z-10" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Menghapus...';
            confirmDeleteBtn.classList.add('opacity-75', 'cursor-not-allowed');
            deleteForm.submit();
        });
    }

    // --- Yearly Comparison Chart (Aggregated/Zoomable) ---
    if (data.yearlyComparison) {
        const ctxYearly = document.getElementById('yearlyChart');
        if (ctxYearly) {
            // Add Zoom & Pan Controls next to title
            const chartCardHeader = ctxYearly.closest('.glass-card').querySelector('h3').parentElement;
            if (!document.getElementById('zoomControls')) {
                const controlsHtml = `
                    <div id="zoomControls" class="flex items-center gap-1.5 ml-auto bg-white/80 backdrop-blur-sm p-1.5 rounded-2xl border border-slate-200/60 shadow-sm">
                        <div class="flex gap-1">
                            <button id="panLeftBtn" class="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-50 text-slate-500 hover:bg-white hover:text-indigo-600 transition-all duration-300 shadow-sm border border-slate-200 hover:border-indigo-200 hover:shadow-indigo-100" title="Geser Kiri">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg>
                            </button>
                            <button id="panRightBtn" class="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-50 text-slate-500 hover:bg-white hover:text-indigo-600 transition-all duration-300 shadow-sm border border-slate-200 hover:border-indigo-200 hover:shadow-indigo-100" title="Geser Kanan">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
                            </button>
                        </div>
                        <div class="w-px h-5 bg-slate-200 self-center mx-1"></div>
                        <div class="flex gap-1">
                            <button id="zoomOutBtn" class="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-50 text-slate-500 hover:bg-white hover:text-indigo-600 transition-all duration-300 shadow-sm border border-slate-200 hover:border-indigo-200 hover:shadow-indigo-100" title="Zoom Out">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" /></svg>
                            </button>
                            <button id="zoomInBtn" class="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-50 text-slate-500 hover:bg-white hover:text-indigo-600 transition-all duration-300 shadow-sm border border-slate-200 hover:border-indigo-200 hover:shadow-indigo-100" title="Zoom In">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
                            </button>
                        </div>
                        <button id="resetZoomBtn" class="hidden flex items-center justify-center px-3 h-7 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-[10px] uppercase tracking-wider hover:bg-indigo-600 hover:text-white transition-all duration-300 shadow-sm border border-indigo-200 hover:border-indigo-600 ml-1 group" title="Reset Default">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-1.5 text-indigo-500 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            Reset
                        </button>
                    </div>`;
                chartCardHeader.insertAdjacentHTML('beforeend', controlsHtml);
            }
            const resetBtn = document.getElementById('resetZoomBtn');
            const zoomInBtn = document.getElementById('zoomInBtn');
            const zoomOutBtn = document.getElementById('zoomOutBtn');
            const panLeftBtn = document.getElementById('panLeftBtn');
            const panRightBtn = document.getElementById('panRightBtn');

            const yearlyData = data.yearlyComparison; // format: { '2023': [{x: 1, y: 100}, {x:2, y:120}...], '2024': ... }
            const colors = { '2023': '#cbd5e1', '2024': '#94a3b8', '2025': COLOR_SECONDARY, '2026': COLOR_PRIMARY };

            const datasets = Object.keys(yearlyData).map(year => {
                // To make the line smooth but not crazy, we apply a moving average
                const rawData = yearlyData[year];
                // simple 7-day moving average to smooth the violent daily spikes when fully zoomed out
                const smoothedData = rawData.map((pt, idx, arr) => {
                    let sum = 0; let count = 0;
                    for (let i = Math.max(0, idx - 3); i <= Math.min(arr.length - 1, idx + 3); i++) {
                        sum += arr[i].y; count++;
                    }
                    return { x: pt.x, y: sum / count, rawY: pt.y };
                });

                return {
                    label: year,
                    data: smoothedData,
                    borderColor: colors[year] || '#ef4444',
                    borderWidth: year === '2026' ? 3 : 2,
                    borderDash: year === '2026' || year === '2025' ? [] : [4, 4],
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    tension: 0.3,
                    parsing: { xAxisKey: 'x', yAxisKey: 'y' }
                };
            });

            // Helper to get Date string from day of year
            const getDateFromDayOfYear = (day) => {
                const leapYear = new Date().getFullYear(); // Use current year just for label mapping
                const d = new Date(leapYear, 0); // Jan 1
                d.setDate(day); // Sets the day of the year
                return d;
            };

            const yearlyChartInstance = new Chart(ctxYearly.getContext('2d'), {
                type: 'line',
                data: { datasets: datasets },
                options: {
                    ...commonOptions,
                    plugins: {
                        ...commonOptions.plugins,
                        legend: { position: 'top', align: 'end' },
                        zoom: {
                            limits: {
                                x: { min: 1, max: 366 }
                            },
                            pan: {
                                enabled: false,
                                mode: 'x',
                                onPanComplete({ chart }) {
                                    const min = chart.scales.x.min;
                                    const max = chart.scales.x.max;
                                    if (max - min < 360) resetBtn.classList.remove('hidden');
                                    else resetBtn.classList.add('hidden');
                                }
                            },
                            zoom: {
                                wheel: { enabled: false },
                                pinch: { enabled: false },
                                mode: 'x',
                                onZoomComplete({ chart }) {
                                    const min = chart.scales.x.min;
                                    const max = chart.scales.x.max;
                                    // if zoomed in, show reset button
                                    if (max - min < 360) resetBtn.classList.remove('hidden');
                                    else resetBtn.classList.add('hidden');
                                }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                title: (context) => {
                                    const dayNum = context[0].parsed.x;
                                    const dateObj = getDateFromDayOfYear(dayNum);
                                    return dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'long' });
                                },
                                label: (c) => {
                                    const rawTarget = c.raw.rawY; // the original non-smoothed data
                                    return ` ${c.dataset.label}: ${Math.round(rawTarget).toLocaleString()}`;
                                }
                            }
                        }
                    },
                    interaction: { mode: 'index', intersect: false },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: { color: 'rgba(226, 232, 240, 0.6)', borderDash: [4, 4] },
                            border: { display: false }
                        },
                        x: {
                            type: 'linear',
                            min: 1,
                            max: 366,
                            bounds: 'ticks',
                            grid: { display: false },
                            border: { display: false },
                            afterBuildTicks: function (axis) {
                                const range = axis.max - axis.min;
                                if (range > 180) {
                                    const monthStartDays = [1, 32, 61, 92, 122, 153, 183, 214, 245, 275, 306, 336];
                                    axis.ticks = monthStartDays.filter(d => d >= axis.min && d <= axis.max).map(d => ({ value: d }));
                                }
                            },
                            ticks: {
                                callback: function (value, index, ticks) {
                                    if (value < 1 || value > 366) return null;
                                    const range = this.max - this.min;
                                    const d = getDateFromDayOfYear(value);

                                    if (range > 180) {
                                        return d.toLocaleDateString('id-ID', { month: 'short' });
                                    } else {
                                        return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                                    }
                                },
                                maxRotation: 0,
                                autoSkip: false,
                                maxTicksLimit: 12
                            }
                        }
                    }
                }
            });

            resetBtn.addEventListener('click', () => {
                yearlyChartInstance.resetZoom();
                resetBtn.classList.add('hidden');
            });
            zoomInBtn.addEventListener('click', () => {
                yearlyChartInstance.zoom(1.2);
                const min = yearlyChartInstance.scales.x.min;
                const max = yearlyChartInstance.scales.x.max;
                if (max - min < 360) resetBtn.classList.remove('hidden');
            });
            zoomOutBtn.addEventListener('click', () => {
                yearlyChartInstance.zoom(0.8);
                const min = yearlyChartInstance.scales.x.min;
                const max = yearlyChartInstance.scales.x.max;
                if (max - min >= 360) resetBtn.classList.add('hidden');
                else resetBtn.classList.remove('hidden');
            });
            panLeftBtn.addEventListener('click', () => {
                yearlyChartInstance.pan({ x: 50 });
            });
            panRightBtn.addEventListener('click', () => {
                yearlyChartInstance.pan({ x: -50 });
            });
        }
    }

    // --- Helper: Update KPI Cards (Client-Side) ---
    const updateSeasonalStats = (allData) => {
        const kpiMonth1El = document.getElementById('kpiMonth1');
        const kpiYear1El = document.getElementById('kpiYear1');
        const kpiMonth2El = document.getElementById('kpiMonth2');
        const kpiYear2El = document.getElementById('kpiYear2');

        if (!kpiMonth1El || !kpiYear1El || !allData || allData.length === 0) return;

        const m1 = kpiMonth1El.value;
        const y1 = kpiYear1El.value;
        const m2 = kpiMonth2El ? kpiMonth2El.value : 'all';
        const y2 = kpiYear2El ? kpiYear2El.value : '';

        // Helper to filter data by month/year
        const filterData = (month, year) => {
            if (!year) return [];
            return allData.filter(d => {
                if (d.year != year) return false;
                if (month !== 'all' && d.month != month) return false;
                return true;
            });
        };

        const data1 = filterData(m1, y1);
        const data2 = filterData(m2, y2);

        const calcStats = (arr) => {
            if (arr.length === 0) return { total: 0, peakHour: 0, peakDay: 0, avg: 0 };
            const total = arr.reduce((a, b) => a + b.value, 0);
            const peakDay = Math.max(...arr.map(d => d.value));
            const peakHour = Math.max(...arr.map(d => d.peak_count || 0));
            const avg = Math.round(total / arr.length);
            return { total, peakHour, peakDay, avg };
        };

        const stats1 = calcStats(data1);
        const stats2 = calcStats(data2);

        const calcGrowth = (curr, prev) => {
            if (prev === 0) return curr > 0 ? 100 : 0;
            return Math.round(((curr - prev) / prev) * 100 * 10) / 10;
        };

        const totalGrowth = calcGrowth(stats1.total, stats2.total);
        const avgGrowth = calcGrowth(stats1.avg, stats2.avg);
        const peakDayGrowth = calcGrowth(stats1.peakDay, stats2.peakDay);
        const peakHourGrowth = calcGrowth(stats1.peakHour, stats2.peakHour);

        // Format label for vs text
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];
        let vsLabel = "-";
        if (y2) {
            vsLabel = `vs ${m2 === 'all' ? '' : monthNames[m2 - 1]} ${y2}`.trim();
        }

        const updateCard = (idVal, idIcon, idText, idContainer, idVs, val, growth, prevLabel) => {
            const elVal = document.getElementById(idVal);
            if (elVal) elVal.innerText = val.toLocaleString();

            const elText = document.getElementById(idText);
            if (elText) elText.innerText = Math.abs(growth) + '%';

            const elVs = document.getElementById(idVs);
            if (elVs) elVs.innerText = prevLabel;

            const container = document.getElementById(idContainer);
            const iconSpan = document.getElementById(idIcon);

            if (container) {
                if (y2) {
                    container.classList.remove('hidden');
                    container.className = `flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full w-fit mt-2 ${growth >= 0 ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50'}`;
                } else {
                    container.classList.add('hidden');
                    // Retain sizing classes for layout stability even when hidden
                    container.className = `hidden flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full w-fit mt-2`;
                }
            }

            const upIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clip-rule="evenodd" /></svg>`;
            const downIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>`;

            if (iconSpan) iconSpan.innerHTML = growth >= 0 ? upIcon : downIcon;
        };

        updateCard('kpiTotalVal', 'kpiTotalGrowthIcon', 'kpiTotalGrowthText', 'kpiTotalGrowthContainer', 'kpiTotalVs', stats1.total, totalGrowth, vsLabel);
        updateCard('kpiAvgVal', 'kpiAvgGrowthIcon', 'kpiAvgGrowthText', 'kpiAvgGrowthContainer', 'kpiAvgVs', stats1.avg, avgGrowth, vsLabel);
        updateCard('kpiPeakVal', 'kpiPeakGrowthIcon', 'kpiPeakGrowthText', 'kpiPeakGrowthContainer', 'kpiPeakVs', stats1.peakDay, peakDayGrowth, vsLabel);
        updateCard('kpiHourPeakVal', 'kpiHourPeakGrowthIcon', 'kpiHourPeakGrowthText', 'kpiHourPeakGrowthContainer', 'kpiHourPeakVs', stats1.peakHour, peakHourGrowth, vsLabel);
    };

    // --- 4. CALENDAR HEATMAP RENDERER (Dynamic) ---
    // Store heatmap data globally so applyHeatmapFilter can access it outside the closure
    window._heatmapData = data.heatmapData || [];
    const renderHeatmap = (targetYear, mode = 'year', overrideData = null) => {
        const container = document.getElementById('calendarHeatmap');
        const monthContainer = document.getElementById('monthGridContainer');

        if (!container) return;

        const allData = overrideData !== null ? overrideData : (data.heatmapData || []);
        const yearData = allData.filter(d => d.year == targetYear);

        let maxVal = 0;
        let minVal = Infinity;
        const dataMap = {};
        const noteMap = {};
        yearData.forEach(d => {
            dataMap[d.date] = d.value;
            if (d.note && d.note.trim() !== '') noteMap[d.date] = d.note;
            if (d.value > maxVal) maxVal = d.value;
            if (d.value < minVal) minVal = d.value;
        });
        if (minVal === Infinity) minVal = 0;

        const getColor = (val) => {
            if (val === 0) return 'bg-slate-100';
            const range = maxVal - minVal;
            const pct = range > 0 ? (val - minVal) / range : 0;
            if (pct < 0.25) return 'bg-indigo-200';
            if (pct < 0.50) return 'bg-indigo-400';
            if (pct < 0.75) return 'bg-indigo-600';
            return 'bg-[#1F3C88]';
        };

        // Update KPI Stats based on the global data
        // Only run if the caller did not pass allData natively, but since we are modifying renderHeatmap
        // we can just call it passing the allData var directly.
        updateSeasonalStats(allData);

        if (mode === 'year') {
            container.innerHTML = '';
            // Make the outer container a responsive grid
            container.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-6 place-items-center w-full';
            // Also reset explicit inline styles applied previously if any
            container.style.display = '';
            container.style.gap = '';

            let html = '';
            const monthsNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];

            // Determine if a specific month is selected from the global filter
            const globalMonthEl = document.querySelector('select[name="month"]');
            const selectedMonth = (globalMonthEl && globalMonthEl.value) ? parseInt(globalMonthEl.value) - 1 : null;

            const startMonth = selectedMonth !== null ? selectedMonth : 0;
            const endMonth = selectedMonth !== null ? selectedMonth : 11;

            for (let m = startMonth; m <= endMonth; m++) {
                const mStart = new Date(targetYear, m, 1);
                const mEnd = new Date(targetYear, m + 1, 0);

                html += `<div class="flex flex-col gap-2 items-center w-full max-w-[200px]">`;
                html += `<span class="text-[11px] font-bold text-slate-400 uppercase tracking-widest">${monthsNames[m]}</span>`;
                html += `<div class="grid grid-cols-7 gap-[3px] bg-white p-3 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow w-full">`;

                // Header for days of week (Senin - Minggu)
                ['S', 'S', 'R', 'K', 'J', 'S', 'M'].forEach(d => {
                    html += `<div class="text-[8px] sm:text-[9px] text-center text-slate-300 font-bold mb-1">${d}</div>`;
                });

                // Pad start of first week based on day of week (Mon=0 .. Sun=6 for Indonesian standard)
                const startDay = mStart.getDay();
                const padDays = startDay === 0 ? 6 : startDay - 1;

                for (let i = 0; i < padDays; i++) {
                    html += `<div class="w-full pt-[100%] rounded-sm bg-transparent relative"></div>`;
                }

                for (let d = 1; d <= mEnd.getDate(); d++) {
                    const y = targetYear;
                    const mo = String(m + 1).padStart(2, '0');
                    const dayStr = String(d).padStart(2, '0');
                    const dateKey = `${y}-${mo}-${dayStr}`;
                    const val = dataMap[dateKey] || 0;

                    const interactivityClass = val > 0 ? "hover:scale-110 hover:z-10 hover:shadow-md cursor-pointer" : "pointer-events-none opacity-50";

                    html += `<div class="w-full pt-[100%] rounded-[3px] sm:rounded-md ${getColor(val)} transition-all duration-300 ${interactivityClass} relative group"
                                    onmouseenter="showHeatmapTooltip(event, '${dateKey}', ${val})"
                                    onmousemove="moveHeatmapTooltip(event)"
                                    onmouseleave="hideHeatmapTooltip()"
                                    onclick="openHeatmapDrillDown('${dateKey}')">
                                ${noteMap[dateKey] ? '<div class="absolute top-[2px] right-[2px] w-[5px] h-[5px] rounded-full bg-amber-400 ring-1 ring-white shadow-sm"></div>' : ''}
                            </div>`;
                }

                html += `</div></div>`;
            }
            container.innerHTML = html;

            // Populate Notes Panel
            populateHeatmapNotes(noteMap);
        }

        if (mode === 'month') {
            monthContainer.innerHTML = '';
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];

            months.forEach((mName, mIdx) => {
                const mStart = new Date(targetYear, mIdx, 1);
                const mEnd = new Date(targetYear, mIdx + 1, 0);

                let calHTML = `<div class="bg-white p-2.5 rounded-xl border border-slate-100 w-full shadow-sm hover:shadow-md transition-shadow">
                                <h4 class="text-xs font-bold text-slate-600 mb-2 text-center uppercase tracking-wider">${mName}</h4>
                                <div class="grid grid-cols-7 gap-0.5">`;

                ['M', 'S', 'S', 'R', 'K', 'J', 'S'].forEach(d => {
                    calHTML += `<div class="text-[8px] text-center text-slate-400 font-bold">${d}</div>`;
                });

                const startD = mStart.getDay();
                for (let i = 0; i < startD; i++) calHTML += `<div></div>`;

                for (let d = 1; d <= mEnd.getDate(); d++) {
                    const dateKey = `${targetYear}-${String(mIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                    const val = dataMap[dateKey] || 0;

                    const interactivityClass = val > 0 ? "cursor-pointer hover:scale-105" : "pointer-events-none opacity-50";

                    calHTML += `<div class="w-5 h-5 flex items-center justify-center text-[9px] rounded-md ${getColor(val)} ${val > 0 && maxVal > 0 && (val - minVal) / (maxVal - minVal) > 0.5 ? 'text-white' : 'text-slate-600'} transition-transform duration-300 ${interactivityClass}" 
                                    onmouseenter="showHeatmapTooltip(event, '${dateKey}', ${val})"
                                    onmousemove="moveHeatmapTooltip(event)"
                                    onmouseleave="hideHeatmapTooltip()"
                                    onclick="openHeatmapDrillDown('${dateKey}')">${d}</div>`;
                }
                calHTML += `</div></div>`;
                monthContainer.innerHTML += calHTML;
            });
        }
    };

    // --- Populate the Notes Panel from noteMap ---
    function populateHeatmapNotes(noteMap) {
        const panel = document.getElementById('heatmapNotesList');
        const badge = document.getElementById('notesBadge');
        if (!panel) return;

        const entries = Object.entries(noteMap).sort((a, b) => a[0].localeCompare(b[0]));

        if (badge) {
            if (entries.length > 0) {
                badge.textContent = entries.length;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }

        if (entries.length === 0) {
            panel.innerHTML = '<p class="text-xs text-amber-500 italic">Belum ada catatan untuk tahun ini.</p>';
            return;
        }

        let html = '';
        entries.forEach(([dateStr, noteText]) => {
            const d = new Date(dateStr);
            const formattedDate = d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
            html += `<div class="flex items-start gap-3 bg-white/80 p-3 rounded-xl border border-amber-100/60 hover:shadow-sm hover:border-amber-200 transition-all group" id="noteCard-${dateStr}">
                <div class="flex-shrink-0 mt-0.5 cursor-pointer" onclick="openHeatmapDrillDown('${dateStr}')">
                    <div class="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    </div>
                </div>
                <div class="flex-1 min-w-0 cursor-pointer" onclick="openHeatmapDrillDown('${dateStr}')">
                    <p class="text-[11px] font-bold text-amber-700 group-hover:text-amber-800 transition-colors">${formattedDate}</p>
                    <p class="text-xs text-slate-600 mt-0.5 line-clamp-2">${noteText}</p>
                </div>
                <div class="flex-shrink-0 flex items-center gap-1 mt-1">
                    <button onclick="event.stopPropagation(); deleteHeatmapNote('${dateStr}')" title="Hapus catatan" class="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                    <button onclick="openHeatmapDrillDown('${dateStr}')" title="Lihat detail" class="p-1.5 rounded-lg text-slate-300 hover:text-amber-500 hover:bg-amber-50 transition-all">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/></svg>
                    </button>
                </div>
            </div>`;
        });
        panel.innerHTML = html;
    }

    // --- Toggle Notes Panel Visibility ---
    window.toggleHeatmapNotes = function () {
        const panel = document.getElementById('heatmapNotesPanel');
        if (!panel) return;
        panel.classList.toggle('hidden');
    };

    // --- Delete a Note via AJAX ---
    window.deleteHeatmapNote = function (dateStr) {
        // Find the branch_code from the heatmap data
        const allData = window._heatmapData || [];
        const entry = allData.find(d => d.date === dateStr);
        const branchCode = entry ? entry.branch_code : (document.getElementById('heatmapBranchFilter')?.value || 'WARR');

        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');

        fetch('/dashboard/notes', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': csrfToken,
                'Accept': 'application/json'
            },
            body: JSON.stringify({ date: dateStr, branch_code: branchCode })
        })
        .then(res => res.json())
        .then(result => {
            if (result.success) {
                // Remove note from local heatmapData so the dot indicator disappears
                const idx = allData.findIndex(d => d.date === dateStr);
                if (idx !== -1) allData[idx].note = '';

                // Animate card removal
                const card = document.getElementById('noteCard-' + dateStr);
                if (card) {
                    card.style.transition = 'all 0.3s ease';
                    card.style.opacity = '0';
                    card.style.transform = 'translateX(20px)';
                    setTimeout(() => {
                        card.remove();

                        // Update badge count
                        const badge = document.getElementById('notesBadge');
                        const remaining = document.querySelectorAll('[id^="noteCard-"]').length;
                        if (badge) {
                            if (remaining > 0) {
                                badge.textContent = remaining;
                            } else {
                                badge.classList.add('hidden');
                                const panel = document.getElementById('heatmapNotesList');
                                if (panel) panel.innerHTML = '<p class="text-xs text-amber-500 italic">Belum ada catatan untuk tahun ini.</p>';
                            }
                        }
                    }, 300);
                }

                // Re-render heatmap to remove dot indicator
                const yearEl = document.getElementById('heatmapYearFilter');
                const targetYear = yearEl ? yearEl.value : new Date().getFullYear();
                renderHeatmap(targetYear, 'year');
            }
        })
        .catch(err => console.error('Delete note failed:', err));
    };

    window.showHeatmapTooltip = (e, dateStr, val) => {
        const tooltipEl = document.getElementById('heatmapTooltip');
        const htDate = document.getElementById('htDate');
        const htValue = document.getElementById('htValue');

        if (!tooltipEl) return;

        const d = new Date(dateStr);
        const formattedDate = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

        htDate.textContent = formattedDate;
        htValue.innerHTML = `<span class="font-bold text-indigo-300 text-sm">${val.toLocaleString()}</span> Penerbangan`;

        tooltipEl.classList.remove('hidden');

        const x = e.clientX;
        const y = e.clientY - 10;
        tooltipEl.style.left = `${x}px`;
        tooltipEl.style.top = `${y}px`;
        tooltipEl.style.opacity = '1';
    };

    window.moveHeatmapTooltip = (e) => {
        const tooltipEl = document.getElementById('heatmapTooltip');
        if (!tooltipEl) return;
        const x = e.clientX;
        const y = e.clientY - 10;
        tooltipEl.style.left = `${x}px`;
        tooltipEl.style.top = `${y}px`;
    };

    window.hideHeatmapTooltip = () => {
        const tooltipEl = document.getElementById('heatmapTooltip');
        if (tooltipEl) {
            tooltipEl.classList.add('hidden');
            tooltipEl.style.opacity = '0';
        }
    };

    window.toggleHeatmapView = (mode) => {
        const yBtn = document.getElementById('btnViewYear');
        const mBtn = document.getElementById('btnViewMonth');
        const yView = document.getElementById('heatmapYearView');
        const mView = document.getElementById('heatmapMonthView');
        const hmSelect = document.getElementById('heatmapSingleYearSelect');
        const currentYear = hmSelect ? hmSelect.value : new Date().getFullYear();

        const activeClasses = ['bg-white', 'text-indigo-600', 'shadow-sm'];
        const inactiveClasses = ['text-slate-500', 'hover:text-slate-700', 'hover:bg-white/50'];

        if (mode === 'year') {
            yBtn.classList.add(...activeClasses);
            yBtn.classList.remove(...inactiveClasses);

            mBtn.classList.remove(...activeClasses);
            mBtn.classList.add(...inactiveClasses);

            yView.classList.remove('hidden');
            mView.classList.add('hidden');
        } else {
            mBtn.classList.add(...activeClasses);
            mBtn.classList.remove(...inactiveClasses);

            yBtn.classList.remove(...activeClasses);
            yBtn.classList.add(...inactiveClasses);

            yView.classList.add('hidden');
            mView.classList.remove('hidden');
        }

        renderHeatmap(currentYear, mode);
    };

    // --- EVENT LISTENERS FOR FILTERS ---
    const updateGlobalKPIs = () => {
        const branch = document.querySelector('select[name="branch"]')?.value || '';
        const m1 = document.getElementById('kpiMonth1')?.value || 'all';
        const y1 = document.getElementById('kpiYear1')?.value || '';
        const m2 = document.getElementById('kpiMonth2')?.value || 'all';
        const y2 = document.getElementById('kpiYear2')?.value || '';

        if (!y1 || !y2) return;

        // Show loading state
        const kpis = ['Total', 'Avg', 'PeakDay', 'HourPeak'];
        kpis.forEach(k => {
            const el = document.getElementById(`kpi${k}Val`);
            if (el) el.innerHTML = '<span class="text-sm animate-pulse text-slate-400">Memuat...</span>';
        });

        fetch(`/dashboard/kpi-data?branch=${branch}&month1=${m1}&year1=${y1}&month2=${m2}&year2=${y2}`)
            .then(res => res.json())
            .then(data => {
                if (data.error) return;

                const updateCard = (key, metric) => {
                    const elVal = document.getElementById(`kpi${key}Val`);
                    const elVs = document.getElementById(`kpi${key}Vs`);
                    const elContainer = document.getElementById(`kpi${key}GrowthContainer`);
                    const elIcon = document.getElementById(`kpi${key}GrowthIcon`);
                    const elText = document.getElementById(`kpi${key}GrowthText`);

                    if (elVal) elVal.innerText = metric.val;
                    if (elVs) elVs.innerText = metric.vs;

                    if (elContainer && elIcon && elText) {
                        elContainer.className = `flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-bold border ${metric.growth > 0 ? 'bg-rose-50 border-rose-100 text-rose-600' : (metric.growth < 0 ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-slate-50 border-slate-200 text-slate-500')}`;
                        elIcon.className = `h-3 w-3 ${metric.growth > 0 ? 'text-rose-500' : (metric.growth < 0 ? 'text-emerald-500' : 'text-slate-400')}`;
                        elIcon.innerHTML = metric.growth > 0
                            ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />'
                            : (metric.growth < 0
                                ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />'
                                : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 12h14" />');
                        elText.innerText = Math.abs(metric.growth) + '%';
                    }
                };

                updateCard('Total', data.total);
                updateCard('Avg', data.avg);
                updateCard('PeakDay', data.peakDay);
                // The peak hour uses `HourPeak` not `PeakHour` in the blade ID
                updateCard('HourPeak', data.peakHour);
            })
            .catch(err => console.error('Failed to fetch KPI data', err));
    };

    ['kpiMonth1', 'kpiYear1', 'kpiMonth2', 'kpiYear2'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', updateGlobalKPIs);
    });

    // Initial Render Heatmap using the dedicated heatmap year filter
    const hmYearEl = document.getElementById('heatmapYearFilter');
    const hmBranchEl = document.getElementById('heatmapBranchFilter');

    // Determine initial year: use dedicated heatmap filter, then page-level year, then latest in data
    let initHmYear = (hmYearEl && hmYearEl.value) ? hmYearEl.value : null;

    if (!initHmYear && data.heatmapData && data.heatmapData.length > 0) {
        initHmYear = Math.max(...data.heatmapData.map(d => parseInt(d.year) || 0));
    }
    if (!initHmYear || initHmYear === 0) {
        initHmYear = new Date().getFullYear();
    }

    renderHeatmap(initHmYear, 'year');

    // Expose to global scope so applyHeatmapFilter (defined outside) can access it
    window._renderHeatmap = renderHeatmap;
});

// Dedicated filter for Heatmap section (Year + Branch only, triggered by "Terapkan" button)
window.applyHeatmapFilter = function () {
    const hmYearEl = document.getElementById('heatmapYearFilter');
    const hmBranchEl = document.getElementById('heatmapBranchFilter');

    const selectedYear = (hmYearEl && hmYearEl.value) ? hmYearEl.value : new Date().getFullYear();
    const selectedBranch = hmBranchEl ? hmBranchEl.value : '';

    // Filter the client-side heatmapData by selected branch
    const allData = window._heatmapData || [];
    const filtered = selectedBranch
        ? allData.filter(d => d.branch_code === selectedBranch)
        : allData;

    const dataToRender = filtered.length > 0 ? filtered : allData;

    // Re-render with the chosen year and filtered data
    if (typeof window._renderHeatmap === 'function') {
        window._renderHeatmap(selectedYear, 'year', dataToRender);
    }
};

// Global Function to Save Note from Modal using AJAX
window.saveHeatmapNote = function () {
    const noteInput = document.getElementById('modalInsightInput');
    const noteDate = document.getElementById('modalInsightDate');
    const noteBranch = document.getElementById('modalInsightBranch');
    const noteBtn = document.getElementById('saveNoteBtn');
    const noteStatus = document.getElementById('saveNoteStatus');

    if (!noteInput || !noteDate || !noteBranch) return;

    noteBtn.disabled = true;
    noteBtn.innerHTML = '<span class="animate-spin mr-1">↻</span> Simpan';

    const csrfTokenMeta = document.querySelector('meta[name="csrf-token"]');
    const csrfToken = csrfTokenMeta ? csrfTokenMeta.getAttribute('content') : '';

    fetch('/dashboard/notes', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': csrfToken,
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            date: noteDate.value,
            branch_code: noteBranch.value,
            note: noteInput.value
        })
    })
        .then(res => res.json())
        .then(response => {
            noteBtn.disabled = false;
            noteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path d="M7.707 10.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V6h5a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2h5v5.586L7.707 10.293z"/></svg> Simpan';

            if (response.success) {
                if (noteStatus) {
                    noteStatus.classList.remove('opacity-0');
                    setTimeout(() => { noteStatus.classList.add('opacity-0'); }, 3000);
                }

                // Update the global data array so if they close and reopen, the note persists without reload
                const dStr = noteDate.value;
                if (window.DashboardData && window.DashboardData.heatmapData) {
                    const currentD = window.DashboardData.heatmapData.find(x => x.date === dStr);
                    if (currentD) currentD.note = noteInput.value;
                }
            }
        })
        .catch(err => {
            console.error('Error saving note:', err);
            noteBtn.disabled = false;
            noteBtn.innerHTML = 'Gagal...';
            setTimeout(() => {
                noteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path d="M7.707 10.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V6h5a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2h5v5.586L7.707 10.293z"/></svg> Simpan';
            }, 2000);
        });
};
