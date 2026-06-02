// ==========================================
// SESSION SECURITY GUARD & LOGOUT MECHANICS
// ==========================================
if (!localStorage.getItem('saas_token')) {
  window.location.href = 'login.html';
}

// Global variable to store active charts for disposal/updating
const activeCharts = {};
let saasData = null;

// Initialize Workspace on Page Load
document.addEventListener('DOMContentLoaded', () => {
  setupUserProfile();
  setupTabNavigation();
  fetchDashboardData();
});

function setupUserProfile() {
  const name = localStorage.getItem('saas_user_name') || 'SaaS Admin';
  const email = localStorage.getItem('saas_user_email') || 'admin@aethersaas.io';
  const pic = localStorage.getItem('saas_user_pic') || 'custom';

  document.getElementById('profileName').innerText = name;
  document.getElementById('profileEmail').innerText = email;
  document.getElementById('welcomeText').innerText = `Welcome back, ${name.split(' ')[0]} 👋`;

  // Set avatar initials
  const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  const avatar = document.getElementById('avatarIcon');
  avatar.innerText = initials;
  if (pic === 'google') {
    avatar.classList.add('avatar-google');
  }

  // Logout Trigger
  document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('saas_token');
    localStorage.removeItem('saas_user_name');
    localStorage.removeItem('saas_user_email');
    localStorage.removeItem('saas_user_pic');
    window.location.href = 'login.html';
  });
}

// ==========================================
// TAB NAVIGATION CONTROLLER
// ==========================================
function setupTabNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const contents = document.querySelectorAll('.tab-content');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabId = item.getAttribute('data-tab');
      
      // Toggle nav items
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');

      // Toggle content panels
      contents.forEach(content => {
        content.classList.remove('active');
        if (content.getAttribute('id') === `tab-${tabId}`) {
          content.classList.add('active');
        }
      });

      // Update header details based on tab
      const headerTitle = document.getElementById('welcomeText');
      const headerSubtext = document.getElementById('welcomeSubtext');
      
      if (tabId === 'overview') {
        headerTitle.innerText = `Workspace Overview`;
        headerSubtext.innerText = 'High-level financial KPIs and tier expansion tracking';
      } else if (tabId === 'subscriptions') {
        headerTitle.innerText = `Revenue & Pricing Tiers`;
        headerSubtext.innerText = 'Subscriber distribution, blended unit economics, and funnel acquisition';
      } else if (tabId === 'retention') {
        headerTitle.innerText = `Retention & Customer Cohorts`;
        headerSubtext.innerText = 'Operational cohort lifetime matrix, NRR, and GRR tracking';
      } else if (tabId === 'churn') {
        headerTitle.innerText = `Churn Prediction & Risk Engine`;
        headerSubtext.innerText = 'Actionable list of active accounts analyzed by Churn Probability classifier';
      } else if (tabId === 'whatif') {
        headerTitle.innerText = `What-If Scenario Planner`;
        headerSubtext.innerText = 'Management strategy dashboard for pricing optimization and retention planning';
      }

      // Re-trigger layout resizing for Chart.js inside tab
      setTimeout(() => {
        Object.keys(activeCharts).forEach(key => {
          activeCharts[key].resize();
          activeCharts[key].update();
        });
      }, 50);
    });
  });
}

// ==========================================
// DATA RETRIEVAL & KPI BINDING
// ==========================================
function fetchDashboardData() {
  fetch('dashboard_data.json')
    .then(response => {
      if (!response.ok) {
        throw new Error('Database file could not be read');
      }
      return response.json();
    })
    .then(data => {
      saasData = data;
      hydrateKPIs(data);
      initializeAllCharts(data);
      renderCohortHeatmap(data.cohort_matrix);
      renderChurnPredictionDetails(data.churn_prediction);
      initializeWhatIfPlanner(data);
      
      // Update loading status
      document.getElementById('welcomeSubtext').innerText = 'SaaS Platform Intelligence Engine • Real-time Metrics Loaded';
    })
    .catch(error => {
      console.error('Error hydrating dashboard:', error);
      document.getElementById('welcomeSubtext').innerText = 'Error loading data pipeline. Verify analyzer output.';
    });
}

function formatCurrency(val) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
}

function formatNumber(val) {
  return new Intl.NumberFormat('en-US').format(val);
}

function hydrateKPIs(data) {
  const stats = data.overall_stats;
  const metrics = data.monthly_metrics;
  
  // Calculate historical trends (comparing final month 23 vs month 22)
  const lastMonth = metrics[metrics.length - 1];
  const prevMonth = metrics[metrics.length - 2];

  // Overview Tab KPIs
  document.getElementById('kpi-mrr').innerText = formatCurrency(stats.current_mrr);
  document.getElementById('kpi-customers').innerText = formatNumber(stats.total_active_customers);
  document.getElementById('kpi-ltv').innerText = formatCurrency(stats.average_ltv);
  document.getElementById('kpi-churn').innerText = `${stats.monthly_churn_rate.toFixed(1)}%`;

  // Dynamic MoM Trends Helper
  const mrrDiff = ((lastMonth.mrr - prevMonth.mrr) / prevMonth.mrr) * 100;
  const custDiff = ((lastMonth.active_users - prevMonth.active_users) / prevMonth.active_users) * 100;
  const churnDiff = lastMonth.churn_rate - prevMonth.churn_rate;

  setTrendIndicator('trend-mrr', mrrDiff, '+', '% MoM');
  setTrendIndicator('trend-customers', custDiff, '+', '% MoM');
  setTrendIndicator('trend-churn', churnDiff, '', '% change', true); // inverse: lower churn is positive

  // Revenue & Plans Tab KPIs
  document.getElementById('kpi-arr').innerText = formatCurrency(stats.current_arr);
  document.getElementById('kpi-arpu').innerText = formatCurrency(lastMonth.arpu);
  document.getElementById('kpi-cac').innerText = formatCurrency(stats.average_cac);
  document.getElementById('kpi-ltvcac').innerText = `${stats.ltv_cac_ratio.toFixed(1)}x`;

  const ltvcacTrend = document.getElementById('trend-ltvcac');
  if (stats.ltv_cac_ratio >= 4) {
    ltvcacTrend.innerHTML = `<i data-lucide="arrow-up-right"></i> Strong LTV`;
    ltvcacTrend.className = 'kpi-trend positive';
  } else if (stats.ltv_cac_ratio >= 3) {
    ltvcacTrend.innerHTML = `<i data-lucide="arrow-up-right"></i> Healthy`;
    ltvcacTrend.className = 'kpi-trend positive';
  } else {
    ltvcacTrend.innerHTML = `<i data-lucide="arrow-down-right"></i> Vulnerable`;
    ltvcacTrend.className = 'kpi-trend negative';
  }

  // Retention Tab KPIs
  document.getElementById('kpi-nrr').innerText = `${stats.net_revenue_retention.toFixed(1)}%`;
  document.getElementById('kpi-grr').innerText = `${stats.gross_revenue_retention.toFixed(1)}%`;

  const nrrTrend = document.getElementById('trend-nrr');
  if (stats.net_revenue_retention >= 100) {
    nrrTrend.innerHTML = `<i data-lucide="arrow-up-right"></i> Expansion Growth`;
    nrrTrend.className = 'kpi-trend positive';
  } else {
    nrrTrend.innerHTML = `<i data-lucide="arrow-down-right"></i> Revenue Contraction`;
    nrrTrend.className = 'kpi-trend negative';
  }

  // Churn Tab KPIs
  document.getElementById('kpi-risk-high').innerText = formatNumber(stats.high_risk_count);
  document.getElementById('kpi-risk-med').innerText = formatNumber(stats.med_risk_count);
  document.getElementById('kpi-risk-low').innerText = formatNumber(stats.low_risk_count);

  lucide.createIcons();
}

function setTrendIndicator(elemId, value, prefix, suffix, invert = false) {
  const elem = document.getElementById(elemId);
  const isPositive = invert ? value < 0 : value > 0;
  const absVal = Math.abs(value).toFixed(1);

  if (isPositive) {
    elem.innerHTML = `<i data-lucide="arrow-up-right"></i> ${prefix}${absVal}${suffix}`;
    elem.className = 'kpi-trend positive';
  } else if (value === 0) {
    elem.innerHTML = `<i data-lucide="minus"></i> ${absVal}${suffix}`;
    elem.className = 'kpi-trend neutral';
  } else {
    elem.innerHTML = `<i data-lucide="arrow-down-right"></i> -${absVal}${suffix}`;
    elem.className = 'kpi-trend negative';
  }
}

// ==========================================
// VISUAL CHART.JS PLOTTERS
// ==========================================
function initializeAllCharts(data) {
  const metrics = data.monthly_metrics;
  const months = metrics.map(m => m.month);

  // Set Global Chart.js Styles for Premium Look
  Chart.defaults.color = 'rgba(255,255,255,0.45)';
  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';

  // 1. MRR Growth Trend Line Chart
  const mrrCtx = document.getElementById('mrrChart').getContext('2d');
  const purpleGlow = mrrCtx.createLinearGradient(0, 0, 0, 300);
  purpleGlow.addColorStop(0, 'rgba(139, 92, 246, 0.45)');
  purpleGlow.addColorStop(1, 'rgba(139, 92, 246, 0.01)');

  activeCharts['mrr'] = new Chart(mrrCtx, {
    type: 'line',
    data: {
      labels: months,
      datasets: [{
        label: 'MRR ($)',
        data: metrics.map(m => m.mrr),
        borderColor: '#8b5cf6',
        borderWidth: 3,
        pointBackgroundColor: '#8b5cf6',
        pointBorderColor: '#ffffff',
        pointHoverRadius: 6,
        fill: true,
        backgroundColor: purpleGlow,
        tension: 0.35
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          ticks: { callback: value => '$' + formatNumber(value) }
        }
      }
    }
  });

  // 2. Subscription Tiers Growth Stacked Bar Chart
  const tiersCtx = document.getElementById('tiersChart').getContext('2d');
  activeCharts['tiers'] = new Chart(tiersCtx, {
    type: 'bar',
    data: {
      labels: months,
      datasets: [
        {
          label: 'Starter ($19)',
          data: metrics.map(m => m.tier_distribution.Starter),
          backgroundColor: '#0ea5e9',
          borderRadius: 4
        },
        {
          label: 'Professional ($49)',
          data: metrics.map(m => m.tier_distribution.Professional),
          backgroundColor: '#f59e0b',
          borderRadius: 4
        },
        {
          label: 'Enterprise ($199)',
          data: metrics.map(m => m.tier_distribution.Enterprise),
          backgroundColor: '#8b5cf6',
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true },
        y: { stacked: true }
      },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, padding: 15 } }
      }
    }
  });

  // 3. User Acquisition Combo Chart (Revenue & Plans Tab)
  const growthCtx = document.getElementById('userGrowthChart').getContext('2d');
  const blueGlow = growthCtx.createLinearGradient(0, 0, 0, 300);
  blueGlow.addColorStop(0, 'rgba(14, 165, 233, 0.3)');
  blueGlow.addColorStop(1, 'rgba(14, 165, 233, 0.01)');

  activeCharts['userGrowth'] = new Chart(growthCtx, {
    type: 'line',
    data: {
      labels: months,
      datasets: [
        {
          type: 'line',
          label: 'Total Active Users',
          data: metrics.map(m => m.active_users),
          borderColor: '#0ea5e9',
          borderWidth: 2,
          fill: true,
          backgroundColor: blueGlow,
          yAxisID: 'y'
        },
        {
          type: 'bar',
          label: 'New Signups',
          data: metrics.map(m => m.new_signups),
          backgroundColor: 'rgba(139, 92, 246, 0.35)',
          borderColor: '#8b5cf6',
          borderWidth: 1,
          borderRadius: 4,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, padding: 15 } }
      },
      scales: {
        y: {
          position: 'left',
          title: { display: true, text: 'Total Database active' }
        },
        y1: {
          position: 'right',
          grid: { drawOnChartArea: false },
          title: { display: true, text: 'Monthly Signups' }
        }
      }
    }
  });

  // 4. Revenue Contribution Share Donut Chart
  const lastMonthData = metrics[metrics.length - 1];
  const starterRev = lastMonthData.tier_distribution.Starter * 19;
  const proRev = lastMonthData.tier_distribution.Professional * 49;
  const enterpriseRev = lastMonthData.tier_distribution.Enterprise * 199;

  const revCtx = document.getElementById('revenueShareChart').getContext('2d');
  activeCharts['revenueShare'] = new Chart(revCtx, {
    type: 'doughnut',
    data: {
      labels: ['Starter ($19 Plan)', 'Professional ($49 Plan)', 'Enterprise ($199 Plan)'],
      datasets: [{
        data: [starterRev, proRev, enterpriseRev],
        backgroundColor: ['#0ea5e9', '#f59e0b', '#8b5cf6'],
        borderWidth: 0,
        hoverOffset: 10
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, padding: 15 } }
      }
    }
  });

  // 5. Churn Risk Distribution Donut Chart (Churn Tab)
  const churnPred = data.churn_prediction;
  const riskCtx = document.getElementById('riskDistributionChart').getContext('2d');
  activeCharts['riskDistribution'] = new Chart(riskCtx, {
    type: 'doughnut',
    data: {
      labels: ['High Risk (&gt;70%)', 'Medium Risk (35-70%)', 'Low Risk (&lt;35%)'],
      datasets: [{
        data: [churnPred.high_risk_count, churnPred.med_risk_count, churnPred.low_risk_count],
        backgroundColor: ['#ef4444', '#f59e0b', '#10b981'],
        borderWidth: 0,
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, padding: 15 } }
      }
    }
  });
}

// ==========================================
// COHORT HEATMAP GRID BINDINGS
// ==========================================
function renderCohortHeatmap(cohorts) {
  const tableBody = document.getElementById('cohortTableBody');
  tableBody.innerHTML = '';

  cohorts.forEach(row => {
    const tr = document.createElement('tr');
    
    // Cohort month column
    const tdMonth = document.createElement('td');
    tdMonth.className = 'cohort-name-cell';
    tdMonth.innerText = row.cohort;
    tr.appendChild(tdMonth);

    // Cohort size column
    const tdSize = document.createElement('td');
    tdSize.className = 'cohort-size-cell';
    tdSize.innerText = formatNumber(row.size);
    tr.appendChild(tdSize);

    // Lifecycle retention rate columns (M0 to M12)
    for (let age = 0; age <= 12; age++) {
      const tdRate = document.createElement('td');
      
      if (age < row.retention.length) {
        const rate = row.retention[age];
        tdRate.innerText = `${rate.toFixed(1)}%`;
        
        // Color scale classes
        let scaleClass = 'retention-sub50';
        if (rate === 100) scaleClass = 'retention-100';
        else if (rate >= 90) scaleClass = 'retention-90';
        else if (rate >= 80) scaleClass = 'retention-80';
        else if (rate >= 70) scaleClass = 'retention-70';
        else if (rate >= 60) scaleClass = 'retention-60';
        else if (rate >= 50) scaleClass = 'retention-50';
        
        tdRate.className = `retention-cell ${scaleClass}`;
      } else {
        // Future months relative to cohort age
        tdRate.innerText = '-';
        tdRate.style.color = 'var(--text-muted)';
      }
      tr.appendChild(tdRate);
    }
    tableBody.appendChild(tr);
  });
}

// ==========================================
// CHURN TAB CUSTOMER LISTING & FILTERS
// ==========================================
let fullHighRiskList = [];

function renderChurnPredictionDetails(pred) {
  fullHighRiskList = pred.high_risk_customers;
  
  // Render Churn Risk Factor Bars
  const factorList = document.getElementById('factorBars');
  factorList.innerHTML = '';
  
  const factors = pred.factors_breakdown;
  const totalFactors = Object.values(factors).reduce((a, b) => a + b, 0);

  const factorKeys = [
    { key: 'Billing Errors', class: 'billing', label: 'Payment Failures / Credit Card Billing Issues' },
    { key: 'Inactivity', class: 'inactivity', label: 'Inactivity / Login Dropoff' },
    { key: 'Support Ticket Spikes', class: 'tickets', label: 'Customer Support Escalations' },
    { key: 'Early Tenure Vulnerability', class: 'tenure', label: 'Early Account Tenure Instability' }
  ];

  factorKeys.forEach(f => {
    const val = factors[f.key] || 0;
    const pct = totalFactors > 0 ? (val / totalFactors) * 100 : 0;
    
    const factorHtml = `
      <div class="factor-item">
        <div class="factor-info">
          <span class="factor-name">${f.label}</span>
          <span class="factor-count">${val} accounts (${pct.toFixed(0)}%)</span>
        </div>
        <div class="factor-bar-bg">
          <div class="factor-bar-fill ${f.class}" style="width: ${pct}%"></div>
        </div>
      </div>
    `;
    factorList.innerHTML += factorHtml;
  });

  // Load actionable customer risk list table
  filterAndRenderCustomerTable();

  // Setup Live Filters
  document.getElementById('searchCustomer').addEventListener('input', filterAndRenderCustomerTable);
  document.getElementById('filterTier').addEventListener('change', filterAndRenderCustomerTable);
  document.getElementById('filterRisk').addEventListener('change', filterAndRenderCustomerTable);
}

function filterAndRenderCustomerTable() {
  const searchVal = document.getElementById('searchCustomer').value.toLowerCase();
  const tierVal = document.getElementById('filterTier').value;
  const riskVal = document.getElementById('filterRisk').value;

  const tableBody = document.getElementById('customerTableBody');
  tableBody.innerHTML = '';

  const filtered = fullHighRiskList.filter(cust => {
    // Search match
    const nameMatch = cust.name.toLowerCase().includes(searchVal) || cust.company.toLowerCase().includes(searchVal);
    // Tier match
    const tierMatch = tierVal === 'All' || cust.tier === tierVal;
    // Risk match
    const riskMatch = riskVal === 'All' || cust.risk_class === riskVal;

    return nameMatch && tierMatch && riskMatch;
  });

  if (filtered.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; color: var(--text-muted); padding: 30px;">
          No customer accounts found matching current query filters.
        </td>
      </tr>
    `;
    return;
  }

  filtered.forEach(cust => {
    const tr = document.createElement('tr');
    
    // Risk Badge Class
    let riskBadgeClass = 'badge-low';
    if (cust.risk_class === 'High Risk') riskBadgeClass = 'badge-high';
    else if (cust.risk_class === 'Medium Risk') riskBadgeClass = 'badge-med';

    tr.innerHTML = `
      <td style="font-weight: 600;">${cust.customer_id}</td>
      <td>
        <div style="font-weight: 500; color: white;">${cust.name}</div>
        <div style="font-size: 11px; color: var(--text-secondary);">${cust.company} • <a href="mailto:${cust.email}" style="color: var(--accent-blue); text-decoration: none;">${cust.email}</a></div>
      </td>
      <td><span class="badge badge-tier ${cust.tier}">${cust.tier}</span></td>
      <td style="text-align: center; font-weight: 600;">${cust.logins}d</td>
      <td style="text-align: center; color: ${cust.tickets >= 2 ? 'var(--accent-red)' : 'inherit'}; font-weight: 600;">${cust.tickets}</td>
      <td style="text-align: center;">${cust.payment_failed ? '<i data-lucide="alert-circle" style="width:16px;height:16px;color:var(--accent-red);margin:0 auto;"></i>' : '<i data-lucide="check" style="width:16px;height:16px;color:var(--accent-green);margin:0 auto;"></i>'}</td>
      <td style="text-align: center; color: var(--text-secondary); font-weight: 500;">${cust.tenure_months} mo</td>
      <td style="text-align: right; font-weight: 700; color: ${cust.risk_prob >= 70 ? 'var(--accent-red)' : 'inherit'};">${cust.risk_prob}%</td>
      <td style="text-align: center; padding-right: 16px;"><span class="badge ${riskBadgeClass}">${cust.risk_class}</span></td>
    `;
    
    tableBody.appendChild(tr);
  });
  
  lucide.createIcons();
}

// ==========================================
// WHAT-IF scenario PLANNER CONTROLS & CHART
// ==========================================
let currentMrrBaseline = 0;
let currentArrBaseline = 0;
let currentChurnBaseline = 0;
let averageCacBaseline = 0;

function initializeWhatIfPlanner(data) {
  const stats = data.overall_stats;
  
  // Setup baseline variables
  currentMrrBaseline = stats.current_mrr;
  currentArrBaseline = stats.current_arr;
  currentChurnBaseline = stats.monthly_churn_rate / 100; // decimal
  averageCacBaseline = stats.average_cac;

  // Set up event listeners for sliders
  const sliders = ['sliderPrice', 'sliderChurn', 'sliderCac'];
  sliders.forEach(s => {
    document.getElementById(s).addEventListener('input', simulateScenario);
  });

  // Initial scenario run
  simulateScenario();
}

function simulateScenario() {
  // Read current slider inputs
  const priceAdj = parseInt(document.getElementById('sliderPrice').value) / 100; // +/- %
  const churnRed = parseInt(document.getElementById('sliderChurn').value) / 100; // mitigation %
  const cacOpt = parseInt(document.getElementById('sliderCac').value) / 100; // +/- %

  // Update DOM slider value text labels
  document.getElementById('val-price').innerText = (priceAdj >= 0 ? '+' : '') + (priceAdj * 100).toFixed(0) + '%';
  document.getElementById('val-churn').innerText = (churnRed * 100).toFixed(0) + '% reduction';
  document.getElementById('val-cac').innerText = (cacOpt >= 0 ? '+' : '') + (cacOpt * 100).toFixed(0) + '%';

  // Perform projection math for the next 12 months (Months 0 to 12)
  const projectionMonths = 12;
  const monthsLabels = [];
  const baselineMrrProg = [];
  const optimizedMrrProg = [];

  // Let's assume standard baseline growth metrics
  // average new signups = ~130 users per month, generating average $40 blended ARPU (~$5,200 MRR addition per month)
  // baseline customer database = 1,202 users, MRR = ~$52,000
  const baselineMonthlySignups = 130;
  const baselineArpu = currentMrrBaseline / 1202; // ~$43.50
  
  let currentActiveUsersBaseline = 1202;
  let currentMrrTrackBaseline = currentMrrBaseline;

  let currentActiveUsersOptimized = 1202;
  let currentMrrTrackOptimized = currentMrrBaseline;

  monthsLabels.push("Current");
  baselineMrrProg.push(currentMrrTrackBaseline);
  optimizedMrrProg.push(currentMrrTrackOptimized);

  for (let m = 1; m <= projectionMonths; m++) {
    monthsLabels.push(`Month ${m}`);
    
    // --- 1. BASELINE CALCULATIONS ---
    // User additions
    const newUsers = baselineMonthlySignups;
    const newRevenue = newUsers * baselineArpu;
    // Churn losses
    const churnLossUsers = currentActiveUsersBaseline * currentChurnBaseline;
    const churnLossRevenue = currentMrrTrackBaseline * currentChurnBaseline;

    currentActiveUsersBaseline = currentActiveUsersBaseline + newUsers - churnLossUsers;
    currentMrrTrackBaseline = currentMrrTrackBaseline + newRevenue - churnLossRevenue;

    baselineMrrProg.push(Math.round(currentMrrTrackBaseline));

    // --- 2. OPTIMIZED Trajectory CALCULATIONS ---
    // Pricing adjusts blended ARPU
    const adjustedArpu = baselineArpu * (1.0 + priceAdj);
    
    // CAC optimization changes signup volume for equivalent budget:
    // lower CAC = more signups for same budget
    // signups = baseline_signups / (1 + cacOpt)
    const optimizedNewUsers = baselineMonthlySignups / (1.0 + cacOpt);
    const optimizedNewRevenue = optimizedNewUsers * adjustedArpu;

    // Churn mitigation reduces the churn rate multiplier
    const optimizedChurnRate = currentChurnBaseline * (1.0 - churnRed);
    const optimizedChurnLossUsers = currentActiveUsersOptimized * optimizedChurnRate;
    const optimizedChurnLossRevenue = currentMrrTrackOptimized * optimizedChurnRate;

    currentActiveUsersOptimized = currentActiveUsersOptimized + optimizedNewUsers - optimizedChurnLossUsers;
    
    // Adjust ongoing revenue by the relative pricing shift
    currentMrrTrackOptimized = currentMrrTrackOptimized + optimizedNewRevenue - optimizedChurnLossRevenue;

    optimizedMrrProg.push(Math.round(currentMrrTrackOptimized));
  }

  // Bind scenario result KPIs in DOM
  const finalBaselineMrr = baselineMrrProg[baselineMrrProg.length - 1];
  const finalOptimizedMrr = optimizedMrrProg[optimizedMrrProg.length - 1];

  const finalBaselineArr = finalBaselineMrr * 12;
  const finalOptimizedArr = finalOptimizedMrr * 12;

  const mrrGainPct = ((finalOptimizedMrr - finalBaselineMrr) / finalBaselineMrr) * 100;
  const arrGainDiff = finalOptimizedArr - finalBaselineArr;

  document.getElementById('scen-mrr').innerText = formatCurrency(finalOptimizedMrr);
  document.getElementById('scen-arr').innerText = formatCurrency(finalOptimizedArr);
  
  const mrrDiffEl = document.getElementById('scen-mrr-diff');
  mrrDiffEl.innerHTML = `<i data-lucide="trending-up"></i> ${mrrGainPct >= 0 ? '+' : ''}${mrrGainPct.toFixed(1)}% vs baseline`;
  mrrDiffEl.className = mrrGainPct >= 0 ? 'scen-stat-change plus' : 'scen-stat-change minus';

  const arrDiffEl = document.getElementById('scen-arr-diff');
  arrDiffEl.innerHTML = `+$${formatNumber(arrGainDiff)} ARR increase`;
  arrDiffEl.className = arrGainDiff >= 0 ? 'scen-stat-change plus' : 'scen-stat-change minus';

  lucide.createIcons();

  // Plot or Update the Projection Chart
  renderProjectionChart(monthsLabels, baselineMrrProg, optimizedMrrProg);
}

function renderProjectionChart(labels, baseline, optimized) {
  const ctx = document.getElementById('whatIfChart').getContext('2d');

  if (activeCharts['whatIf']) {
    // If chart exists, update data directly to preserve animations
    activeCharts['whatIf'].data.labels = labels;
    activeCharts['whatIf'].data.datasets[0].data = baseline;
    activeCharts['whatIf'].data.datasets[1].data = optimized;
    activeCharts['whatIf'].update('none'); // silent update without layout transitions
    return;
  }

  // Create clean lines glowing
  activeCharts['whatIf'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Baseline Trajectory',
          data: baseline,
          borderColor: 'rgba(255,255,255,0.25)',
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false,
          tension: 0.15
        },
        {
          label: 'Optimized Strategy Path',
          data: optimized,
          borderColor: '#0ea5e9',
          borderWidth: 4,
          pointBackgroundColor: '#0ea5e9',
          pointBorderColor: '#ffffff',
          pointHoverRadius: 6,
          fill: false,
          tension: 0.15
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, padding: 15 } }
      },
      scales: {
        y: {
          ticks: { callback: value => '$' + formatNumber(value) }
        }
      }
    }
  });
}
