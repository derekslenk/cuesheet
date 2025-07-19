'use client';

import { useState, useCallback } from 'react';
import { Toast, ToastType } from '@/components/Toast';

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((
    type: ToastType,
    title: string,
    message?: string,
    duration?: number
  ) => {
    const id = Math.random().toString(36).substr(2, 9);
    const toast: Toast = {
      id,
      type,
      title,
      message,
      duration: duration ?? (type === 'error' ? 7000 : 5000), // Errors stay longer
    };

    setToasts((prev) => [...prev, toast]);
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const clearAllToasts = useCallback(() => {
    setToasts([]);
  }, []);

  // Convenience methods
  const showSuccess = useCallback((title: string, message?: string) => {
    return addToast('success', title, message);
  }, [addToast]);

  const showError = useCallback((title: string, message?: string) => {
    return addToast('error', title, message);
  }, [addToast]);

  const showWarning = useCallback((title: string, message?: string) => {
    return addToast('warning', title, message);
  }, [addToast]);

  const showInfo = useCallback((title: string, message?: string) => {
    return addToast('info', title, message);
  }, [addToast]);

  return {
    toasts,
    addToast,
    removeToast,
    clearAllToasts,
    showSuccess,
    showError,
    showWarning,
    showInfo,
  };
}