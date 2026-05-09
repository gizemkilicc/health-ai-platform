import { logEvent } from './auditService';
import { getCurrentUser, getToken } from './authService';
import { API_BASE } from './api';

const getHeaders = () => {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

export const requestMeeting = async (postId, targetUserId, message) => {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const response = await fetch(`${API_BASE}/api/meetings`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ postId, receiverId: targetUserId, message, proposedDate: new Date().toISOString() })
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'Failed to request meeting');
  }
  const data = await response.json();
  logEvent(user.id, user.role, 'MEETING_REQUEST', `meeting_${data.id}`, 'SUCCESS', { targetUserId, postId });
  return data;
};

export const getUserMeetings = async () => {
  const user = getCurrentUser();
  if (!user) return [];
  const response = await fetch(`${API_BASE}/api/meetings`, {
    headers: getHeaders()
  });
  if (!response.ok) throw new Error('Failed to fetch meetings');
  return await response.json();
};

export const updateMeetingStatus = async (meetingId, newStatus, proposedTime = null) => {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const response = await fetch(`${API_BASE}/api/meetings/${meetingId}/status`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ status: newStatus, proposedTime })
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'Failed to update meeting status');
  }
  const data = await response.json();
  logEvent(user.id, user.role, 'MEETING_UPDATE', `meeting_${meetingId}`, 'SUCCESS', { newStatus });
  return data;
};

export const markMeetingAsRead = async (meetingId) => {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const response = await fetch(`${API_BASE}/api/meetings/${meetingId}/read`, {
    method: 'PUT',
    headers: getHeaders()
  });
  if (!response.ok) throw new Error('Failed to mark as read');
  return await response.json();
};
