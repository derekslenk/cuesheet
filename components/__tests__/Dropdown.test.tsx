import { render, fireEvent, screen } from '@testing-library/react';
import Dropdown from '../Dropdown';

const OPTIONS = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `Team ${i + 1} — streamer_${i + 1}` }));

function openDropdownWithRect(rect: Partial<DOMRect>) {
  const onSelect = jest.fn();
  render(<Dropdown options={OPTIONS} activeId={null} onSelect={onSelect} label="Select a Team" />);
  const button = screen.getByRole('button');
  jest.spyOn(button, 'getBoundingClientRect').mockReturnValue({
    top: 0,
    bottom: 0,
    left: 50,
    right: 350,
    width: 300,
    height: 40,
    x: 50,
    y: 0,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect);
  fireEvent.click(button);
  const menu = document.querySelector('.dropdown-menu') as HTMLElement;
  expect(menu).not.toBeNull();
  return menu;
}

describe('Dropdown menu positioning', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerHeight', { value: 768, writable: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('opens downward with the full 400px cap when there is room below', () => {
    // spaceBelow = 768 - 100 - 4 - 8 = 656 → capped at 400
    const menu = openDropdownWithRect({ top: 60, bottom: 100 });
    expect(menu.style.top).toBe('104px');
    expect(menu.style.bottom).toBe('');
    expect(menu.style.maxHeight).toBe('400px');
  });

  it('clamps maxHeight to the available space below when uncramped but short', () => {
    // spaceBelow = 768 - 456 - 12 = 300 ≥ flip threshold → still opens down, clamped
    const menu = openDropdownWithRect({ top: 416, bottom: 456 });
    expect(menu.style.top).toBe('460px');
    expect(menu.style.maxHeight).toBe('300px');
  });

  it('flips upward when the button sits near the viewport bottom', () => {
    // spaceBelow = 768 - 740 - 12 = 16 < 240; spaceAbove = 700 - 12 = 688
    const menu = openDropdownWithRect({ top: 700, bottom: 740 });
    expect(menu.style.bottom).toBe('72px'); // 768 - 700 + 4
    expect(menu.style.top).toBe('');
    expect(menu.style.maxHeight).toBe('400px');
  });

  it('renders every option even when the list exceeds the cap', () => {
    openDropdownWithRect({ top: 700, bottom: 740 });
    for (const option of OPTIONS) {
      expect(screen.getByText(option.name)).toBeInTheDocument();
    }
  });
});
