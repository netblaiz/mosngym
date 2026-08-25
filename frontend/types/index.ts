// =============================================================================
// API Response Types — mirrors the database schema
// =============================================================================

export interface ApiResponse<T> {
  success: boolean
  data:    T
}

export interface PaginatedResponse<T> {
  success: boolean
  data:    T[]
  meta: {
    total:      number
    page:       number
    limit:      number
    totalPages: number
    hasNext:    boolean
    hasPrev:    boolean
  }
}

// ─── Gym ──────────────────────────────────────────────────────────────────────

export interface Gym {
  id:                  string
  name:                string
  slug:                string
  email:               string | null
  phone:               string | null
  website:             string | null
  logo_url:            string | null
  brand_color:         string | null
  timezone:            string
  country:             string
  currency:            string
  subscription_plan:   string
  subscription_status: string
  trial_ends_at:       string | null
  created_at:          string
}

export interface GymSettings {
  id:                       string
  gym_id:                   string
  booking_lead_time_hrs:    number
  booking_max_advance_days: number
  cancel_window_hrs:        number
  no_show_fee:              string
  allow_online_signup:      boolean
  allow_guest_booking:      boolean
  access_mode:              string
  checkin_method:           string[]
  member_app_enabled:       boolean
  widget_enabled:           boolean
}

export interface GymLocation {
  id:           string
  gym_id:       string
  name:         string
  address_line1: string | null
  city:         string | null
  country:      string | null
  phone:        string | null
  is_primary:   boolean
  open_hours:   Record<string, { open: string; close: string }> | null
  is_active:    boolean
}

// ─── Member ───────────────────────────────────────────────────────────────────

export interface Member {
  id:                string
  gym_id:            string
  user_id:           string | null
  email:             string
  phone:             string | null
  first_name:        string
  last_name:         string
  date_of_birth:     string | null
  gender:            string | null
  photo_url:         string | null
  health_notes:      string | null
  status:            'active' | 'inactive' | 'frozen' | 'banned'
  joined_at:         string
  created_at:        string
  // ── add these ──
  emergency_contact: {
    name:         string
    phone:        string
    relationship: string
  } | null
  subscription?:     MemberSubscription | null
  last_seen_at?:     string | null
  total_checkins?:   number
  classes_attended?: number
}

// ─── Plan ─────────────────────────────────────────────────────────────────────

export interface Plan {
  id:                   string
  gym_id:               string
  name:                 string
  description:          string | null
  price:                string
  billing_cycle:        'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'one_time' | 'drop_in'
  duration_days:        number | null
  class_credits:        number | null
  access_all_locations: boolean
  is_public:            boolean
  sort_order:           number
  stripe_price_id:      string | null
  archived_at:          string | null
  active_subscriptions?: number
}

// ─── Subscription ─────────────────────────────────────────────────────────────

export interface MemberSubscription {
  id:                     string
  gym_id:                 string
  member_id:              string
  plan_id:                string
  status:                 'active' | 'frozen' | 'past_due' | 'cancelled' | 'expired'
  start_date:             string
  end_date:               string | null
  next_billing_date:      string | null
  frozen_from:            string | null
  frozen_until:           string | null
  credits_total:          number | null
  credits_remaining:      number | null
  price_paid:             string
  currency:               string
  cancel_at_period_end:   boolean
  auto_renew:             boolean
  created_at:             string
  // Joined fields
  plan_name?:             string
  billing_cycle?:         string
  first_name?:            string
  last_name?:             string
  email?:                 string
}

// ─── Class ────────────────────────────────────────────────────────────────────

export interface ClassTemplate {
  id:               string
  gym_id:           string
  name:             string
  description:      string | null
  duration_mins:    number
  default_capacity: number
  color:            string
  category:         string | null
  requires_credits: number
  is_active:        boolean
}

export interface ClassSession {
  id:               string
  gym_id:           string
  template_id:      string
  trainer_id:       string | null
  location_id:      string
  starts_at:        string
  ends_at:          string
  capacity:         number
  status:           'scheduled' | 'in_progress' | 'completed' | 'cancelled'
  recurrence_rule:  string | null
  notes:            string | null
  created_at:       string
  // Joined fields
  class_name?:      string
  color?:           string
  duration_mins?:   number
  location_name?:   string
  confirmed_count?: number
  waitlisted_count?: number
  requires_credits?: number
}

// ─── Booking ──────────────────────────────────────────────────────────────────

export interface Booking {
  id:                 string
  gym_id:             string
  member_id:          string
  session_id:         string
  status:             'confirmed' | 'waitlisted' | 'cancelled' | 'no_show' | 'attended'
  waitlist_position:  number | null
  credits_used:       number
  checked_in_at:      string | null
  booked_at:          string
  // Joined fields
  first_name?:        string
  last_name?:         string
  email?:             string
  class_name?:        string
  starts_at?:         string
  location_name?:     string
}

// ─── Check-in ─────────────────────────────────────────────────────────────────

export interface CheckIn {
  id:              string
  member_id:       string
  location_id:     string
  method:          string
  result:          'granted' | 'denied'
  checked_in_at:   string
  checked_out_at:  string | null
  // Joined fields
  first_name?:     string
  last_name?:      string
  photo_url?:      string
  location_name?:  string
}

// ─── Staff ────────────────────────────────────────────────────────────────────

export interface Staff {
  id:              string
  gym_id:          string
  user_id:         string
  role:            string
  bio:             string | null
  certifications:  string[]
  is_active:       boolean
  invited_at:      string
  accepted_at:     string | null
  // Joined fields
  email?:          string
  last_login_at?:  string
  role_templates?: RoleTemplate[]
}

export interface RoleTemplate {
  id:       string
  name:     string
  color:    string
  icon:     string
  is_system: boolean
}

// ─── Payment ──────────────────────────────────────────────────────────────────

export interface Payment {
  id:               string
  member_id:        string | null
  type:             string
  status:           'pending' | 'succeeded' | 'failed' | 'refunded' | 'partially_refunded'
  amount:           string
  currency:         string
  amount_refunded:  string
  payment_method:   string | null
  failure_reason:   string | null
  paid_at:          string | null
  created_at:       string
  // Joined fields
  first_name?:      string
  last_name?:       string
  email?:           string
  plan_name?:       string
}

// ─── Lead ─────────────────────────────────────────────────────────────────────

export interface Lead {
  id:                   string
  gym_id:               string
  first_name:           string
  last_name:            string | null
  email:                string | null
  phone:                string | null
  source:               string
  stage:                'new' | 'contacted' | 'trial_booked' | 'trial_done' | 'converted' | 'lost'
  notes:                string | null
  assigned_to_id:       string | null
  converted_member_id:  string | null
  converted_at:         string | null
  created_at:           string
  // Joined
  interested_plan_name?: string
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export interface AnalyticsOverview {
  members: {
    active_members:  number
    new_last_30d:    number
    frozen:          number
    inactive:        number
  }
  revenue: {
    revenue_this_month:  string
    revenue_last_month:  string
    failed_last_7d:      number
  }
  checkins: {
    checkins_today:   number
    checkins_last_7d: number
    unique_today:     number
  }
  classes: {
    classes_today:        number
    avg_fill_rate_today:  string
  }
  leads: {
    open_leads:          number
    converted_last_30d:  number
  }
  generatedAt: string
}
