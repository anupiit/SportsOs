import type {
  AchievementLevel,
  AttemptOutcome,
  BookingType,
  ComplaintCategory,
  FacilityType,
  Priority,
} from '@sportsos/shared';

export const HOSTELS = [
  'Amber',
  'Aquamarine',
  'Diamond',
  'Emerald',
  'Jasper',
  'Opal',
  'Rosaline',
  'Ruby',
  'Sapphire',
  'Topaz',
];

export const SPORTS = [
  'Athletics',
  'Badminton',
  'Basketball',
  'Chess',
  'Cricket',
  'Football',
  'Hockey',
  'Kabaddi',
  'Lawn Tennis',
  'Swimming',
  'Table Tennis',
  'Volleyball',
  'Weightlifting',
  'Yoga',
];

export const FACILITY_TYPE_LABEL: Record<FacilityType, string> = {
  GROUND: 'Ground',
  COURT: 'Court',
  INDOOR_HALL: 'Indoor hall',
  POOL: 'Pool',
  GYM: 'Gym',
  TRACK: 'Track',
};

export const BOOKING_TYPE_LABEL: Record<BookingType, string> = {
  CASUAL: 'Casual play',
  CLUB_PRACTICE: 'Club practice',
  EVENT: 'Event',
  MAINTENANCE: 'Maintenance',
};

export const COMPLAINT_CATEGORY_LABEL: Record<ComplaintCategory, string> = {
  FACILITY: 'Facility',
  EQUIPMENT: 'Equipment',
  STAFF: 'Staff',
  BOOKING: 'Booking',
  OTHER: 'Other',
};

export const PRIORITY_LABEL: Record<Priority, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' };

export const ACHIEVEMENT_LEVEL_LABEL: Record<AchievementLevel, string> = {
  HOSTEL: 'Hostel',
  INSTITUTE: 'Institute',
  INTER_IIT: 'Inter-IIT',
  STATE: 'State',
  NATIONAL: 'National',
  INTERNATIONAL: 'International',
};

export const ATTEMPT_OUTCOME_LABEL: Record<AttemptOutcome, { title: string; help: string }> = {
  ACCEPTED: { title: 'Attendance verified', help: 'Your check-in was recorded.' },
  BAD_OTP: { title: 'Incorrect or expired code', help: 'Codes rotate every 30 seconds — enter the code currently on the coach’s screen.' },
  OUT_OF_GEOFENCE: { title: 'Outside the facility geofence', help: 'You must be physically at the facility to check in.' },
  LOW_ACCURACY: { title: 'GPS signal too weak', help: 'Your location accuracy is worse than 100 m. Step into the open and retry.' },
  DUPLICATE: { title: 'Already checked in', help: 'You already have a record for this session.' },
  DEVICE_REUSED: { title: 'Device already used', help: 'This device has checked in another student for this session.' },
  SESSION_CLOSED: { title: 'Session closed', help: 'The coach has closed this session.' },
  NOT_ELIGIBLE: { title: 'Not eligible', help: 'This session is limited to active members of the club.' },
};
