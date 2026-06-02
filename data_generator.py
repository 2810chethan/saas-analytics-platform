import os
import csv
import random
import math
from datetime import datetime, timedelta

def create_directory(path):
    if not os.path.exists(path):
        os.makedirs(path)

# Configuration & Constants
START_DATE = datetime(2024, 6, 1)
TOTAL_MONTHS = 24

TIERS = {
    'Starter': {'price': 19, 'cac_min': 40, 'cac_max': 70, 'base_churn': 0.08},
    'Professional': {'price': 49, 'cac_min': 120, 'cac_max': 180, 'base_churn': 0.04},
    'Enterprise': {'price': 199, 'cac_min': 500, 'cac_max': 700, 'base_churn': 0.015}
}

FIRST_NAMES = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Jamie', 'Robin', 'Chris', 'Pat', 'Sam',
               'Sarah', 'Michael', 'David', 'Jessica', 'Emily', 'James', 'John', 'Robert', 'Lisa', 'Karen',
               'Arjun', 'Priya', 'Vikram', 'Ananya', 'Raj', 'Sneha', 'Rahul', 'Neha', 'Amit', 'Aditi']
LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Garcia', 'Rodriguez', 'Wilson',
              'Sharma', 'Patel', 'Kumar', 'Singh', 'Gupta', 'Joshi', 'Mehta', 'Rao', 'Reddy', 'Nair',
              'Chen', 'Li', 'Wong', 'Tan', 'Sato', 'Suzuki', 'Kim', 'Lee', 'Park', 'Choi']
COMPANIES = ['CloudScale', 'TechFlow', 'DataPulse', 'ApexSystems', 'NovaSolutions', 'QuantumLog',
             'SynergyCo', 'VertexLabs', 'IntegraSoft', 'CoreDynamics', 'ZetaWorks', 'OptimaGroup',
             'AetherTech', 'PixelCraft', 'InnoVentures', 'SwiftSaaS', 'BoldMetrics', 'StripeCore']

def get_month_str(month_idx):
    current_date = START_DATE + timedelta(days=month_idx * 30.5)
    return current_date.strftime('%Y-%m')

def generate_saas_data(target_dir):
    create_directory(target_dir)
    
    users_file = os.path.join(target_dir, 'users.csv')
    activity_file = os.path.join(target_dir, 'activity_logs.csv')
    
    # Store generated users
    users = []
    # Store generated monthly activity logs
    activity_logs = []
    
    customer_counter = 1001
    random.seed(42) # Ensure reproducibility
    
    for m in range(TOTAL_MONTHS):
        month_str = get_month_str(m)
        
        # Exponential growth of signups: starts around 40, grows at ~6% MoM with noise
        num_signups = int(40 * math.pow(1.06, m) + random.randint(-10, 15))
        num_signups = max(15, num_signups) # Floor of 15 signups
        
        for _ in range(num_signups):
            cust_id = f"CUST-{customer_counter}"
            customer_counter += 1
            
            # Select plan tier (Starter: 60%, Professional: 30%, Enterprise: 10%)
            tier_rand = random.random()
            if tier_rand < 0.60:
                tier = 'Starter'
            elif tier_rand < 0.90:
                tier = 'Professional'
            else:
                tier = 'Enterprise'
                
            price = TIERS[tier]['price']
            cac = round(random.uniform(TIERS[tier]['cac_min'], TIERS[tier]['cac_max']), 2)
            
            # Demographic details
            name = f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"
            company = f"{random.choice(COMPANIES)} {random.choice(['LLC', 'Inc', 'Co', 'Group', 'Labs'])}"
            email = f"{name.lower().replace(' ', '.')}@{company.lower().split()[0]}.com"
            
            # Cohort early adoption penalty (higher churn for earliest customers)
            cohort_penalty = 1.3 if m < 6 else (1.0 if m < 15 else 0.8)
            base_churn = TIERS[tier]['base_churn'] * cohort_penalty
            
            # Customer behavior profile
            # some users are highly active (low churn), some are passive (high churn)
            user_loyalty = random.choice([0.5, 0.8, 1.0, 1.2, 1.8]) # multipliers for churn prob (smaller is more loyal)
            
            churned = False
            churn_month_idx = None
            
            # Track customer usage and calculate lifecycle month-by-month
            # We simulate month by month from signup month (m) to current month (TOTAL_MONTHS - 1)
            tenure_months = 0
            for current_m in range(m, TOTAL_MONTHS):
                tenure_months += 1
                
                # Dynamic factors for activity
                # active days last 30 (range 0 to 30)
                # loyal users log in more, but if they are going to churn, their logins decay
                base_active = random.randint(15, 28) if tier == 'Enterprise' else (random.randint(8, 22) if tier == 'Professional' else random.randint(3, 16))
                
                # Is customer heading to churn?
                # Let's say if they churn in 1 or 2 months, their activity decays significantly
                will_churn_soon = False
                months_until_churn = 999
                
                # Check if user will churn in this step
                # Monthly churn probability modeled dynamically based on:
                # 1. Base tier churn
                # 2. Support tickets (escalation)
                # 3. Payment failures
                # 4. Tenure length (longer tenure = lower churn)
                tenure_loyalty = max(0.4, 1.0 - (tenure_months * 0.03))
                
                # Add random support ticket spikes & payment failures for this month
                support_tickets = random.choices([0, 1, 2, 3], weights=[0.70, 0.20, 0.08, 0.02])[0]
                payment_failed = random.choices([0, 1], weights=[0.97, 0.03])[0] if tier != 'Enterprise' else random.choices([0, 1], weights=[0.995, 0.005])[0]
                
                # Inactivity factor
                activity_score = random.randint(30, 95)
                # Let loyalty determine activity baseline
                activity_score = int(activity_score * (1.2 if user_loyalty < 0.8 else 0.8 if user_loyalty > 1.2 else 1.0))
                activity_score = max(5, min(100, activity_score))
                
                # Calculate churn probability for this active month
                ticket_multiplier = 1.0 + (support_tickets * 0.4)
                payment_multiplier = 2.5 if payment_failed else 1.0
                activity_multiplier = 2.0 if activity_score < 30 else (1.5 if activity_score < 50 else 0.7 if activity_score > 80 else 1.0)
                
                monthly_churn_prob = base_churn * user_loyalty * tenure_loyalty * ticket_multiplier * payment_multiplier * activity_multiplier
                monthly_churn_prob = min(0.95, monthly_churn_prob) # Cap probability
                
                # Execute churn roll
                if random.random() < monthly_churn_prob:
                    churned = True
                    churn_month_idx = current_m
                    
                    # Log activity for this last month (heavily degraded)
                    logins = max(1, int(base_active * 0.2))
                    feat_usage = max(5, int(activity_score * 0.3))
                    
                    activity_logs.append({
                        'customer_id': cust_id,
                        'month_idx': current_m,
                        'month': get_month_str(current_m),
                        'logins': logins,
                        'feature_usage_score': feat_usage,
                        'support_tickets': support_tickets,
                        'payment_failed': payment_failed
                    })
                    break
                else:
                    # Healthy active month
                    # Adjust activity metrics slightly based on tenure
                    logins = max(1, min(30, int(base_active * random.uniform(0.8, 1.2))))
                    feat_usage = max(10, min(100, int(activity_score * random.uniform(0.9, 1.1))))
                    
                    activity_logs.append({
                        'customer_id': cust_id,
                        'month_idx': current_m,
                        'month': get_month_str(current_m),
                        'logins': logins,
                        'feature_usage_score': feat_usage,
                        'support_tickets': support_tickets,
                        'payment_failed': payment_failed
                    })
            
            # Save user record
            users.append({
                'customer_id': cust_id,
                'name': name,
                'email': email,
                'company': company,
                'signup_month': month_str,
                'signup_month_idx': m,
                'tier': tier,
                'monthly_revenue': price,
                'cac': cac,
                'status': 'Churned' if churned else 'Active',
                'churn_month': get_month_str(churn_month_idx) if churned else '',
                'churn_month_idx': churn_month_idx if churned else -1,
                'lifetime_months': tenure_months
            })
            
    # Write Users to CSV
    with open(users_file, mode='w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['customer_id', 'name', 'email', 'company', 'signup_month', 
                                              'signup_month_idx', 'tier', 'monthly_revenue', 'cac', 
                                              'status', 'churn_month', 'churn_month_idx', 'lifetime_months'])
        writer.writeheader()
        writer.writerows(users)
        
    # Write Activity Logs to CSV
    with open(activity_file, mode='w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['customer_id', 'month_idx', 'month', 'logins', 
                                              'feature_usage_score', 'support_tickets', 'payment_failed'])
        writer.writeheader()
        writer.writerows(activity_logs)
        
    print(f"Data generation complete! Saved in: {target_dir}")
    print(f"Total Users: {len(users)}")
    print(f"Total Activity Logs: {len(activity_logs)}")

if __name__ == '__main__':
    target_directory = r"C:\Users\Chethan kalyan\.gemini\antigravity\scratch\saas_analytics_platform\data"
    generate_saas_data(target_directory)
