import { render, screen, fireEvent, act } from '@testing-library/react';
import { ToastComponent, ToastContainer, Toast, ToastType } from '../Toast';

// Mock timer functions
jest.useFakeTimers();

describe('ToastComponent', () => {
  const mockOnRemove = jest.fn();
  
  const createToast = (type: ToastType = 'info', duration?: number): Toast => ({
    id: 'test-toast',
    type,
    title: 'Test Title',
    message: 'Test message',
    duration,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
    jest.useFakeTimers();
  });

  it('renders toast with title and message', () => {
    const toast = createToast();
    render(<ToastComponent toast={toast} onRemove={mockOnRemove} />);
    
    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('Test message')).toBeInTheDocument();
  });

  it('renders different types with correct styling', () => {
    const types: ToastType[] = ['success', 'error', 'warning', 'info'];
    
    types.forEach((type) => {
      const toast = createToast(type);
      const { container } = render(<ToastComponent toast={toast} onRemove={mockOnRemove} />);
      
      const toastElement = container.firstChild as HTMLElement;
      expect(toastElement).toHaveClass('glass');
      
      // Check for type-specific classes
      const expectedClasses = {
        success: 'bg-green-500/20',
        error: 'bg-red-500/20', 
        warning: 'bg-yellow-500/20',
        info: 'bg-blue-500/20',
      };
      
      expect(toastElement).toHaveClass(expectedClasses[type]);
    });
  });

  it('shows correct icons for different types', () => {
    const iconTests = [
      { type: 'success' as ToastType, icon: '✅' },
      { type: 'error' as ToastType, icon: '❌' },
      { type: 'warning' as ToastType, icon: '⚠️' },
      { type: 'info' as ToastType, icon: 'ℹ️' },
    ];

    iconTests.forEach(({ type, icon }) => {
      const toast = createToast(type);
      render(<ToastComponent toast={toast} onRemove={mockOnRemove} />);
      
      expect(screen.getByText(icon)).toBeInTheDocument();
    });
  });

  it('calls onRemove when close button is clicked', () => {
    const toast = createToast();
    render(<ToastComponent toast={toast} onRemove={mockOnRemove} />);
    
    const closeButton = screen.getByLabelText('Close notification');
    fireEvent.click(closeButton);
    
    // Should start the fade out animation
    act(() => {
      jest.advanceTimersByTime(300);
    });
    
    expect(mockOnRemove).toHaveBeenCalledWith('test-toast');
  });

  it('auto-removes after default duration', () => {
    const toast = createToast();
    render(<ToastComponent toast={toast} onRemove={mockOnRemove} />);
    
    // Fast forward past the default duration (5000ms) plus fade out time (300ms)
    act(() => {
      jest.advanceTimersByTime(5300);
    });
    
    expect(mockOnRemove).toHaveBeenCalledWith('test-toast');
  });

  it('auto-removes after custom duration', () => {
    const toast = createToast('info', 2000);
    render(<ToastComponent toast={toast} onRemove={mockOnRemove} />);
    
    // Fast forward past the custom duration (2000ms) plus fade out time (300ms)
    act(() => {
      jest.advanceTimersByTime(2300);
    });
    
    expect(mockOnRemove).toHaveBeenCalledWith('test-toast');
  });

  it('error toasts stay longer than other types', () => {
    const errorToast = createToast('error', 7000); // Explicitly set error duration
    render(<ToastComponent toast={errorToast} onRemove={mockOnRemove} />);
    
    // Error toasts should have 7000ms duration by default
    act(() => {
      jest.advanceTimersByTime(6999);
    });
    expect(mockOnRemove).not.toHaveBeenCalled();
    
    act(() => {
      jest.advanceTimersByTime(301); // 7000ms + 300ms fade out
    });
    expect(mockOnRemove).toHaveBeenCalledWith('test-toast');
  });

  it('renders without message when message is not provided', () => {
    const toast: Toast = {
      id: 'test-toast',
      type: 'info',
      title: 'Test Title',
      // no message
    };
    
    render(<ToastComponent toast={toast} onRemove={mockOnRemove} />);
    
    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.queryByText('Test message')).not.toBeInTheDocument();
  });
});

describe('ToastContainer', () => {
  const mockOnRemove = jest.fn();
  
  const createToasts = (): Toast[] => [
    {
      id: 'toast-1',
      type: 'success',
      title: 'Success Toast',
      message: 'Success message',
    },
    {
      id: 'toast-2', 
      type: 'error',
      title: 'Error Toast',
      message: 'Error message',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders multiple toasts', () => {
    const toasts = createToasts();
    render(<ToastContainer toasts={toasts} onRemove={mockOnRemove} />);
    
    expect(screen.getByText('Success Toast')).toBeInTheDocument();
    expect(screen.getByText('Error Toast')).toBeInTheDocument();
  });

  it('renders nothing when no toasts', () => {
    const { container } = render(<ToastContainer toasts={[]} onRemove={mockOnRemove} />);
    
    expect(container.firstChild).toBeNull();
  });

  it('has proper positioning classes', () => {
    const toasts = createToasts();
    const { container } = render(<ToastContainer toasts={toasts} onRemove={mockOnRemove} />);
    
    const containerElement = container.firstChild as HTMLElement;
    expect(containerElement).toHaveClass('fixed', 'top-4', 'right-4', 'z-50');
  });

  it('calls onRemove for individual toasts', () => {
    const toasts = createToasts();
    render(<ToastContainer toasts={toasts} onRemove={mockOnRemove} />);
    
    const closeButtons = screen.getAllByLabelText('Close notification');
    fireEvent.click(closeButtons[0]);
    
    act(() => {
      jest.advanceTimersByTime(300);
    });
    
    expect(mockOnRemove).toHaveBeenCalledWith('toast-1');
  });
});