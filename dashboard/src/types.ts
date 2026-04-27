export enum RoleEnum {
  ADMIN = 'admin',
  CHAIRMAN = 'chairman',
  STAROSTA = 'starosta',
  USER = 'user',
}

export type AccessListType = 'white' | 'black';

export interface User {
  id: number;
  chat_id: string;
  role: RoleEnum;
  room: string | null;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  floor: number | null;
  wing: string | null;
  is_blocked: boolean;
  is_whitelisted: boolean;
  access_list: AccessListType;
}

export interface DutyQueue {
  id: number;
  room: string;
  position: number;
  floor: number;
  wing: string;
}

export interface BotLog {
  id: number;
  event: string;
  timestamp: string;
  user_id: string | null;
}

export interface FailedNotification {
  id: number;
  user_id: number;
  chat_id: string;
  reason: string;
  timestamp: string;
}

export interface IncomingUserMessage {
  id: number;
  sender_chat_id: string;
  sender_username: string | null;
  sender_role: string | null;
  sender_floor: number | null;
  sender_room: string | null;
  text: string;
  received_at: string;
}

export interface OutgoingMessageLog {
  id: number;
  category: string;
  sender_chat_id: string;
  sender_username: string | null;
  sender_role: string | null;
  sender_floor: number | null;
  sender_room: string | null;
  recipient_chat_id: string;
  recipient_username: string | null;
  recipient_role: string | null;
  recipient_floor: number | null;
  recipient_room: string | null;
  text: string;
  status: string;
  error_message: string | null;
  created_at: string;
}

export type ViewType = 'dashboard' | 'general' | 'users' | 'schedule' | 'statistics' | 'management' | 'profile';

export type DutyAssessmentGrade = 'excellent' | 'good' | 'satisfactory' | 'unsatisfactory';

export interface DutyAssessment {
  grade: DutyAssessmentGrade;
  note: string | null;
  created_by_chat_id: string;
  created_at: string;
  updated_at: string;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
}

export interface DashboardSessionUser {
  chat_id: string;
  role: RoleEnum;
  floor: number | null;
  room: string | null;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  is_blocked: boolean;
  is_whitelisted: boolean;
  access_list: AccessListType;
  display_name: string;
}

export interface DashboardPermissions {
  can_view_overview: boolean;
  can_view_logs: boolean;
  can_view_errors: boolean;
  can_view_user_history: boolean;
  can_view_schedule: boolean;
  can_view_statistics: boolean;
  can_manage_schedule: boolean;
  can_manage_duty_assessments: boolean;
  can_manage_roles: boolean;
  can_manage_user_access: boolean;
  can_manage_notifications: boolean;
  can_broadcast: boolean;
  can_view_profile: boolean;
}

export interface DashboardSessionResponse {
  user: DashboardSessionUser;
  scope: 'all' | 'floor';
  allowed_views: ViewType[];
  permissions: DashboardPermissions;
  accessible_floors: number[];
}

export interface DashboardProfileResponse {
  session: DashboardSessionResponse;
  personal_rating: DutyRatingItem | null;
  floor_rating: DutyRatingItem[];
}

export interface GeneralLogItem {
  id: string;
  type: 'incoming' | 'outgoing' | 'event';
  timestamp: string;
  title: string;
  subtitle: string;
  text: string;
  status: string;
  error_message: string | null;
}

export interface ErrorLogItem {
  id: string;
  type: 'notification' | 'message';
  timestamp: string;
  message: string;
  context: string;
}

export interface DashboardOverviewResponse {
  summary: {
    users_count: number;
    bot_logs_count: number;
    messages_count: number;
    failed_count: number;
  };
  recent_activity: GeneralLogItem[];
  recent_errors: ErrorLogItem[];
}

export interface GeneralLogsResponse {
  items: GeneralLogItem[];
}

export interface ErrorsResponse {
  items: ErrorLogItem[];
}

export interface UserListItem extends User {
  display_name: string;
}

export interface UsersResponse {
  items: UserListItem[];
  total: number;
}

export interface UserFootprintItem {
  id: string;
  type: 'incoming' | 'outgoing' | 'error';
  timestamp: string;
  text: string;
  status: string;
  error_message: string | null;
  direction: 'from_user' | 'to_user' | 'error';
}

export interface UserFootprintResponse {
  user: UserListItem;
  items: UserFootprintItem[];
}

export interface NotificationSettingItem {
  floor: number;
  notification_hour: number;
  notification_minute: number;
  last_notified_on: string | null;
  updated_at: string | null;
}

export interface NotificationSettingsResponse {
  items: NotificationSettingItem[];
}

export interface DutyCalendarDay {
  date: string;
  day: number;
  weekday: number;
  room: string | null;
  queue_position: number | null;
  is_today: boolean;
  is_current_month: boolean;
  assessment: DutyAssessment | null;
}

export interface DutyRatingItem {
  room: string;
  assessment_count: number;
  average_score: number;
  average_percent: number;
  grade_counts: Record<DutyAssessmentGrade, number>;
  latest_assessment_at: string | null;
  xp: number;
  level: number;
  level_title: string;
  next_level_xp: number;
  level_progress: number;
  rank: number;
  achievements: Achievement[];
}

export interface DutyCalendarResponse {
  floor: number;
  year: number;
  month: number;
  can_edit: boolean;
  can_assess: boolean;
  scope: 'all' | 'floor';
  accessible_floors: number[];
  start_date: string;
  queue: DutyQueue[];
  notification_setting: NotificationSettingItem;
  days: DutyCalendarDay[];
  personal_rating: DutyRatingItem | null;
}

export interface DutyAssessmentResponse {
  floor: number;
  duty_date: string;
  room: string;
  assessment: DutyAssessment;
}

export interface DutyStatsItem {
  room: string;
  assessment_count: number;
  average_score: number;
  average_percent: number;
  grade_counts: Record<DutyAssessmentGrade, number>;
  latest_assessment_at: string | null;
  xp: number;
  level: number;
  level_title: string;
  next_level_xp: number;
  level_progress: number;
  rank: number;
  achievements: Achievement[];
}

export interface DutyStatsResponse {
  floor: number;
  start_date: string;
  end_date: string;
  items: DutyStatsItem[];
  summary: {
    assessment_count: number;
    average_score: number;
    grade_counts: Record<DutyAssessmentGrade, number>;
  };
}

export interface ManagementRolesResponse {
  admins: UserListItem[];
  chairmen: UserListItem[];
  starostas: UserListItem[];
}

export interface AccessKeyResponse {
  key: string;
  role_to_assign: 'chairman' | 'starosta';
}

export interface BroadcastResponse {
  target: string;
  recipients_count: number;
  sent_count: number;
  failed_count: number;
}
