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

export const createPost = async (postData) => {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const response = await fetch(`${API_BASE}/api/posts`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(postData)
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'Failed to create post');
  }
  const data = await response.json();
  logEvent(user.id, user.role, 'POST_CREATE', `post_${data.id}`, 'SUCCESS');
  return data;
};

export const getPosts = async (filters = {}) => {
  const response = await fetch(`${API_BASE}/api/posts`);
  if (!response.ok) throw new Error('Failed to fetch posts');
  let posts = await response.json();
  if (filters.domain) posts = posts.filter(p => p.domain === filters.domain);
  if (filters.city) posts = posts.filter(p => p.city === filters.city);
  if (filters.status) posts = posts.filter(p => p.status === filters.status);
  if (filters.authorId) posts = posts.filter(p => p.authorId === filters.authorId);
  if (filters.authorRole) posts = posts.filter(p => p.authorRole === filters.authorRole);
  return posts;
};

export const getPostById = async (postId) => {
  const posts = await getPosts();
  return posts.find(p => p.id === postId);
};

export const updatePostStatus = async (postId, newStatus) => {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const response = await fetch(`${API_BASE}/api/posts/${postId}/status`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ status: newStatus })
  });
  if (!response.ok) {
    const err = await response.json();
    logEvent(user.id, user.role, 'POST_STATUS_UPDATE', `post_${postId}`, 'FAILED', { reason: err.error });
    throw new Error(err.error || 'Failed to update post');
  }
  const data = await response.json();
  logEvent(user.id, user.role, 'POST_STATUS_UPDATE', `post_${postId}`, 'SUCCESS', { newStatus });
  return data;
};

export const deletePost = async (postId) => {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const response = await fetch(`${API_BASE}/api/posts/${postId}`, {
    method: 'DELETE',
    headers: getHeaders()
  });
  if (!response.ok) throw new Error('Failed to delete post');
  logEvent(user.id, user.role, 'POST_DELETE', `post_${postId}`, 'SUCCESS');
};

export const editPost = async (postId, updatedData) => {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const response = await fetch(`${API_BASE}/api/posts/${postId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(updatedData)
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'Failed to update post');
  }
  const data = await response.json();
  logEvent(user.id, user.role, 'POST_EDIT', `post_${postId}`, 'SUCCESS');
  return data;
};
