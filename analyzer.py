import os
import csv
import json
import math
from datetime import datetime, timedelta

def load_csv(file_path):
    data = []
    if not os.path.exists(file_path):
        return data
    with open(file_path, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            data.append(row)
    return data

def get_month_name(month_str):
    if not month_str:
        return ""
    # format "YYYY-MM" to "MMM YYYY"
    try:
        dt = datetime.strptime(month_str, "%Y-%m")
        return dt.strftime("%b %Y")
    except ValueError:
        return month_str

def analyze_saas(data_dir, output_file):
    users = load_csv(os.path.join(data_dir, 'users.csv'))
    activity = load_csv(os.path.join(data_dir, 'activity_logs.csv'))
    
    if not users or not activity:
        print("Error: Missing dataset files. Run data_generator.py first.")
        return
    
    # Pre-parse types for faster calculations
    for u in users:
        u['signup_month_idx'] = int(u['signup_month_idx'])
        u['monthly_revenue'] = float(u['monthly_revenue'])
        u['cac'] = float(u['cac'])
        u['churn_month_idx'] = int(u['churn_month_idx']) if u['churn_month_idx'] else -1
        u['lifetime_months'] = int(u['lifetime_months'])
        
    for a in activity:
        a['month_idx'] = int(a['month_idx'])
        a['logins'] = int(a['logins'])
        a['feature_usage_score'] = int(a['feature_usage_score'])
        a['support_tickets'] = int(a['support_tickets'])
        a['payment_failed'] = int(a['payment_failed'])
        
    # Group activity by user and month for easy lookup
    user_activity = {}
    for a in activity:
        cust_id = a['customer_id']
        m_idx = a['month_idx']
        if cust_id not in user_activity:
            user_activity[cust_id] = {}
        user_activity[cust_id][m_idx] = a
        
    total_months = 24
    monthly_metrics = []
    
    # 1. Calculate Monthly Metrics sequentially
    for m in range(total_months):
        month_str = users[0]['signup_month'] # dynamic fallback
        # Find month string for m
        for u in users:
            if u['signup_month_idx'] == m:
                month_str = u['signup_month']
                break
                
        month_label = get_month_name(month_str)
        
        # Determine who is active in Month m
        # A user is active in Month m if m_signup <= m AND (not churned OR m_churn > m)
        active_users = []
        churned_in_month = []
        new_signups = []
        
        for u in users:
            s_idx = u['signup_month_idx']
            c_idx = u['churn_month_idx']
            
            if s_idx <= m:
                if c_idx == -1 or c_idx > m:
                    active_users.append(u)
                elif c_idx == m:
                    # Churned exactly in this month
                    churned_in_month.append(u)
            
            if s_idx == m:
                new_signups.append(u)
                
        # Financial aggregation
        mrr = sum(u['monthly_revenue'] for u in active_users)
        arr = mrr * 12
        active_count = len(active_users)
        signup_count = len(new_signups)
        churn_count = len(churned_in_month)
        
        # Tier counts
        starter_count = sum(1 for u in active_users if u['tier'] == 'Starter')
        pro_count = sum(1 for u in active_users if u['tier'] == 'Professional')
        enterprise_count = sum(1 for u in active_users if u['tier'] == 'Enterprise')
        
        # ARPU
        arpu = mrr / active_count if active_count > 0 else 0
        
        # Churn Rate
        # standard: Churn rate = churned in month / active at start of month
        # active at start of month = active in m-1 (or active in m + churned in m - new_signups in m)
        if m == 0:
            churn_rate = 0.0
        else:
            prev_active_count = active_count + churn_count - signup_count
            churn_rate = churn_count / prev_active_count if prev_active_count > 0 else 0.0
            
        # Average CAC of new signups
        avg_cac = sum(u['cac'] for u in new_signups) / signup_count if signup_count > 0 else 0.0
        if avg_cac == 0.0 and len(monthly_metrics) > 0:
            avg_cac = monthly_metrics[-1]['cac'] # carry forward
            
        # LTV = ARPU * Gross Margin (85%) / Churn Rate
        # Cap churn rate at min 1.5% to avoid division by zero or outlier spikes in early data
        effective_churn_rate = max(0.015, churn_rate)
        ltv = arpu * 0.85 / effective_churn_rate
        ltv_cac_ratio = ltv / avg_cac if avg_cac > 0 else 0.0
        
        # NRR and GRR calculation (comparing month m-1 active cohort to month m)
        nrr = 1.0
        grr = 1.0
        
        if m > 0:
            # Cohort of users active in m-1
            prev_month_active = []
            for u in users:
                s_idx = u['signup_month_idx']
                c_idx = u['churn_month_idx']
                if s_idx < m and (c_idx == -1 or c_idx >= m):
                    prev_month_active.append(u)
            
            revenue_prev = sum(u['monthly_revenue'] for u in prev_month_active)
            revenue_curr = 0
            revenue_retained_no_expansion = 0
            
            for u in prev_month_active:
                c_idx = u['churn_month_idx']
                # If they are still active in month m
                if c_idx == -1 or c_idx > m:
                    revenue_curr += u['monthly_revenue']
                    # for GRR, we look at current revenue capped at previous revenue (no expansion)
                    revenue_retained_no_expansion += min(u['monthly_revenue'], u['monthly_revenue']) # since plan is static, but upgraded revenue would be capped
                # if they churned in month m, their current revenue is 0
                
            if revenue_prev > 0:
                nrr = revenue_curr / revenue_prev
                grr = revenue_retained_no_expansion / revenue_prev
            else:
                nrr = 1.0
                grr = 1.0
                
        monthly_metrics.append({
            'month_idx': m,
            'month': month_label,
            'mrr': round(mrr, 2),
            'arr': round(arr, 2),
            'active_users': active_count,
            'new_signups': signup_count,
            'churned_users': churn_count,
            'churn_rate': round(churn_rate * 100, 2),
            'arpu': round(arpu, 2),
            'cac': round(avg_cac, 2),
            'ltv': round(ltv, 2),
            'ltv_cac_ratio': round(ltv_cac_ratio, 2),
            'nrr': round(nrr * 100, 2),
            'grr': round(grr * 100, 2),
            'tier_distribution': {
                'Starter': starter_count,
                'Professional': pro_count,
                'Enterprise': enterprise_count
            }
        })
        
    # 2. Cohort Retention Heatmap Matrix
    cohort_matrix = []
    # Analyze cohorts from month 0 to 22 (so they have at least 1 month of potential history)
    for cohort_idx in range(total_months - 1):
        cohort_users = [u for u in users if u['signup_month_idx'] == cohort_idx]
        cohort_size = len(cohort_users)
        if cohort_size == 0:
            continue
            
        cohort_month_str = get_month_name(users[0]['signup_month'])
        for u in users:
            if u['signup_month_idx'] == cohort_idx:
                cohort_month_str = get_month_name(u['signup_month'])
                break
                
        retention_rates = []
        # Max lifecycle analysis: Month 0 to Month 12
        max_months_to_analyze = min(13, total_months - cohort_idx)
        
        for age in range(max_months_to_analyze):
            target_m_idx = cohort_idx + age
            # Count active cohort members in target month
            active_cohort_count = 0
            for u in cohort_users:
                c_idx = u['churn_month_idx']
                if c_idx == -1 or c_idx > target_m_idx:
                    active_cohort_count += 1
            
            rate = (active_cohort_count / cohort_size) * 100
            retention_rates.append(round(rate, 1))
            
        cohort_matrix.append({
            'cohort': cohort_month_str,
            'size': cohort_size,
            'retention': retention_rates
        })
        
    # 3. Churn Risk Prediction Engine
    # Predict risk for users who are currently ACTIVE in the final month (m = 23, i.e., May 2026)
    last_month_idx = total_months - 1
    current_active_users = [u for u in users if u['signup_month_idx'] <= last_month_idx and (u['churn_month_idx'] == -1 or u['churn_month_idx'] > last_month_idx)]
    
    low_risk = 0
    med_risk = 0
    high_risk = 0
    
    churn_factors = {
        'Inactivity': 0,
        'Support Ticket Spikes': 0,
        'Billing Errors': 0,
        'Early Tenure Vulnerability': 0
    }
    
    scored_customers = []
    
    for u in current_active_users:
        cust_id = u['customer_id']
        tier = u['tier']
        tenure = u['lifetime_months']
        
        # Load activity log for this user in the final month
        log = user_activity.get(cust_id, {}).get(last_month_idx, None)
        
        logins = log['logins'] if log else 10
        feature_score = log['feature_usage_score'] if log else 50
        tickets = log['support_tickets'] if log else 0
        payment_failed = log['payment_failed'] if log else 0
        
        # Churn Prediction Logistic Heuristic Model
        # Base log-odds (intercept)
        logit = -0.5
        
        # Impact factors
        # 1. Tier bias (Starters have higher baseline risk)
        if tier == 'Starter':
            logit += 0.4
        elif tier == 'Enterprise':
            logit -= 0.6
            
        # 2. Login inactivity (fewer than 8 logins per month is highly risky)
        if logins < 5:
            logit += 1.8
        elif logins < 12:
            logit += 0.8
        elif logins > 22:
            logit -= 0.8
            
        # 3. Feature engagement score
        if feature_score < 30:
            logit += 1.4
        elif feature_score < 50:
            logit += 0.6
        elif feature_score > 80:
            logit -= 0.7
            
        # 4. Support Tickets (high ticket volume leads to frustration churn)
        if tickets >= 2:
            logit += 1.2
        elif tickets == 1:
            logit += 0.3
            
        # 5. Payment failed (extremely critical card churn trigger)
        if payment_failed:
            logit += 2.2
            
        # 6. Tenure length (early tenure is much more unstable)
        if tenure <= 3:
            logit += 0.8
        elif tenure >= 12:
            logit -= 0.9
            
        # Sigmoid function map to probability
        risk_prob = 1.0 / (1.0 + math.exp(-logit))
        
        # Categorize
        if risk_prob >= 0.70:
            risk_class = 'High Risk'
            high_risk += 1
            # Track dominant factor
            if payment_failed:
                churn_factors['Billing Errors'] += 1
            elif logins < 10 or feature_score < 40:
                churn_factors['Inactivity'] += 1
            elif tickets >= 2:
                churn_factors['Support Ticket Spikes'] += 1
            else:
                churn_factors['Early Tenure Vulnerability'] += 1
        elif risk_prob >= 0.35:
            risk_class = 'Medium Risk'
            med_risk += 1
        else:
            risk_class = 'Low Risk'
            low_risk += 1
            
        scored_customers.append({
            'customer_id': cust_id,
            'name': u['name'],
            'email': u['email'],
            'company': u['company'],
            'tier': tier,
            'monthly_revenue': u['monthly_revenue'],
            'tenure_months': tenure,
            'logins': logins,
            'feature_score': feature_score,
            'tickets': tickets,
            'payment_failed': payment_failed,
            'risk_prob': round(risk_prob * 100, 1),
            'risk_class': risk_class
        })
        
    # Sort scored customers by risk probability descending
    scored_customers.sort(key=lambda x: x['risk_prob'], reverse=True)
    # Take top 50 high-risk customers for action list
    top_high_risk = scored_customers[:50]
    
    # Calculate overall KPIs for summary cards (from final month, month 23)
    latest_m = monthly_metrics[-1]
    overall_stats = {
        'current_mrr': latest_m['mrr'],
        'current_arr': latest_m['arr'],
        'total_active_customers': latest_m['active_users'],
        'average_ltv': latest_m['ltv'],
        'average_cac': latest_m['cac'],
        'ltv_cac_ratio': latest_m['ltv_cac_ratio'],
        'net_revenue_retention': latest_m['nrr'],
        'gross_revenue_retention': latest_m['grr'],
        'monthly_churn_rate': latest_m['churn_rate'],
        'active_new_signups': latest_m['new_signups'],
        'active_churns': latest_m['churned_users'],
        'low_risk_count': low_risk,
        'med_risk_count': med_risk,
        'high_risk_count': high_risk,
    }
    
    # Compile full package
    dashboard_data = {
        'overall_stats': overall_stats,
        'monthly_metrics': monthly_metrics,
        'cohort_matrix': cohort_matrix,
        'churn_prediction': {
            'low_risk_count': low_risk,
            'med_risk_count': med_risk,
            'high_risk_count': high_risk,
            'factors_breakdown': churn_factors,
            'high_risk_customers': top_high_risk
        }
    }
    
    # Write to dashboard_data.json
    with open(output_file, mode='w', encoding='utf-8') as f:
        json.dump(dashboard_data, f, indent=2)
        
    print(f"SaaS Analysis Complete! JSON results saved to: {output_file}")
    print(f"Active Users Analyzed: {len(current_active_users)}")
    print(f"High Churn Risk Accounts: {high_risk}")

if __name__ == '__main__':
    data_directory = r"C:\Users\Chethan kalyan\.gemini\antigravity\scratch\saas_analytics_platform\data"
    output_json = r"C:\Users\Chethan kalyan\.gemini\antigravity\scratch\saas_analytics_platform\dashboard_data.json"
    analyze_saas(data_directory, output_json)
