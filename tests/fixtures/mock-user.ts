export const mockUserId = 'user-00000000-0000-0000-0000-000000000001';

export const mockUser = {
  id: mockUserId,
  full_name: 'Test User',
  email: 'test@example.com',
  password_hash: '$2b$12$placeholder_hash',
  university: 'Test University',
  graduation_year: 2024,
  target_role_category: 'Software Engineering',
  career_goal: 'Become a senior backend engineer at a FAANG company',
  onboarding_step: 5,
  onboarding_complete: true,
  profile_photo_s3_key: null,
  notif_gap_digest: true,
  notif_gen_complete: false,
  notif_sync_complete: true,
  created_at: new Date('2024-01-01T00:00:00Z'),
  updated_at: new Date('2024-01-01T00:00:00Z'),
};

export const mockSafeUser = (() => {
  const { password_hash: _h, ...safe } = mockUser;
  void _h;
  return safe;
})();
