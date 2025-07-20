import { renderHook, act } from '@testing-library/react';
import { useToast } from '../useToast';

describe('useToast', () => {
  let mockRandom: jest.SpyInstance;

  beforeEach(() => {
    // Reset Math.random to ensure consistent IDs in tests
    mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    mockRandom.mockRestore();
  });

  it('starts with empty toasts array', () => {
    const { result } = renderHook(() => useToast());
    
    expect(result.current.toasts).toEqual([]);
  });

  it('adds a toast with addToast', () => {
    const { result } = renderHook(() => useToast());
    
    act(() => {
      result.current.addToast('info', 'Test Title', 'Test message');
    });
    
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]).toMatchObject({
      type: 'info',
      title: 'Test Title',
      message: 'Test message',
      duration: 5000,
    });
    expect(result.current.toasts[0].id).toBeDefined();
  });

  it('adds error toast with longer duration', () => {
    const { result } = renderHook(() => useToast());
    
    act(() => {
      result.current.addToast('error', 'Error Title');
    });
    
    expect(result.current.toasts[0]).toMatchObject({
      type: 'error',
      title: 'Error Title',
      duration: 7000, // Errors stay longer
    });
  });

  it('adds toast with custom duration', () => {
    const { result } = renderHook(() => useToast());
    
    act(() => {
      result.current.addToast('success', 'Success Title', 'Success message', 3000);
    });
    
    expect(result.current.toasts[0]).toMatchObject({
      type: 'success',
      title: 'Success Title',
      message: 'Success message',
      duration: 3000,
    });
  });

  it('removes a toast by ID', () => {
    const { result } = renderHook(() => useToast());
    
    let toastId: string;
    
    act(() => {
      toastId = result.current.addToast('info', 'Test Title');
    });
    
    expect(result.current.toasts).toHaveLength(1);
    
    act(() => {
      result.current.removeToast(toastId);
    });
    
    expect(result.current.toasts).toHaveLength(0);
  });

  it('clears all toasts', () => {
    const { result } = renderHook(() => useToast());
    
    act(() => {
      result.current.addToast('info', 'Toast 1');
      result.current.addToast('error', 'Toast 2');
      result.current.addToast('success', 'Toast 3');
    });
    
    expect(result.current.toasts).toHaveLength(3);
    
    act(() => {
      result.current.clearAllToasts();
    });
    
    expect(result.current.toasts).toHaveLength(0);
  });

  it('supports multiple toasts', () => {
    const { result } = renderHook(() => useToast());
    
    act(() => {
      result.current.addToast('info', 'Toast 1');
      result.current.addToast('error', 'Toast 2');
      result.current.addToast('success', 'Toast 3');
    });
    
    expect(result.current.toasts).toHaveLength(3);
    expect(result.current.toasts[0].title).toBe('Toast 1');
    expect(result.current.toasts[1].title).toBe('Toast 2');
    expect(result.current.toasts[2].title).toBe('Toast 3');
  });

  describe('convenience methods', () => {
    it('showSuccess creates success toast', () => {
      const { result } = renderHook(() => useToast());
      
      act(() => {
        result.current.showSuccess('Success!', 'Operation completed');
      });
      
      expect(result.current.toasts[0]).toMatchObject({
        type: 'success',
        title: 'Success!',
        message: 'Operation completed',
      });
    });

    it('showError creates error toast', () => {
      const { result } = renderHook(() => useToast());
      
      act(() => {
        result.current.showError('Error!', 'Something went wrong');
      });
      
      expect(result.current.toasts[0]).toMatchObject({
        type: 'error',
        title: 'Error!',
        message: 'Something went wrong',
        duration: 7000,
      });
    });

    it('showWarning creates warning toast', () => {
      const { result } = renderHook(() => useToast());
      
      act(() => {
        result.current.showWarning('Warning!', 'Be careful');
      });
      
      expect(result.current.toasts[0]).toMatchObject({
        type: 'warning',
        title: 'Warning!',
        message: 'Be careful',
      });
    });

    it('showInfo creates info toast', () => {
      const { result } = renderHook(() => useToast());
      
      act(() => {
        result.current.showInfo('Info', 'Helpful information');
      });
      
      expect(result.current.toasts[0]).toMatchObject({
        type: 'info',
        title: 'Info',
        message: 'Helpful information',
      });
    });
  });

  it('returns unique IDs for each toast', () => {
    const { result } = renderHook(() => useToast());
    
    let id1: string = '', id2: string = '';
    
    act(() => {
      // Mock different random values for unique IDs
      mockRandom
        .mockReturnValueOnce(0.1)
        .mockReturnValueOnce(0.9);
      
      id1 = result.current.addToast('info', 'Toast 1');
      id2 = result.current.addToast('info', 'Toast 2');
    });
    
    expect(id1).not.toBe(id2);
    expect(result.current.toasts[0].id).toBe(id1);
    expect(result.current.toasts[1].id).toBe(id2);
  });

  it('removes only the specified toast when multiple exist', () => {
    const { result } = renderHook(() => useToast());
    
    let id1: string, id2: string, id3: string;
    
    act(() => {
      // Mock different random values for unique IDs
      mockRandom
        .mockReturnValueOnce(0.1)
        .mockReturnValueOnce(0.5)
        .mockReturnValueOnce(0.9);
      
      id1 = result.current.addToast('info', 'Toast 1');
      id2 = result.current.addToast('error', 'Toast 2');  
      id3 = result.current.addToast('success', 'Toast 3');
    });
    
    expect(result.current.toasts).toHaveLength(3);
    
    act(() => {
      result.current.removeToast(id2);
    });
    
    expect(result.current.toasts).toHaveLength(2);
    expect(result.current.toasts.find(t => t.id === id1)).toBeDefined();
    expect(result.current.toasts.find(t => t.id === id2)).toBeUndefined();
    expect(result.current.toasts.find(t => t.id === id3)).toBeDefined();
  });
});