-- This migration is deliberately kept separate from the message constraint update.
-- PostgreSQL requires a committed enum value before it can be used in a constraint.
alter type public.portal_message_channel add value if not exists 'admin_student';
