'use client';

import { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

type DropdownProps = {
  options: Array<{ id: number; name: string }>;
  activeId: number | null;
  onSelect: (id: number) => void;
  label: string;
  isOpen?: boolean;
  onToggle?: (isOpen: boolean) => void;
};

// Menu geometry: anchored below the button by default; flips above it when
// the space below is cramped (bottom-row dropdowns) and clamps maxHeight to
// the available space so the list scrolls instead of running off-screen.
type MenuPosition = {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
};

/** Gap between the button edge and the menu. */
const MENU_GAP = 4;
/** Breathing room kept from the viewport edge. */
const VIEWPORT_MARGIN = 8;
/** Below-space threshold that triggers opening upward (≈4 items). */
const FLIP_THRESHOLD = 240;
/** Hard cap mirroring .dropdown-menu's CSS max-height. */
const MENU_MAX_HEIGHT = 400;
/** Floor so the menu never collapses unusably small. */
const MENU_MIN_HEIGHT = 120;

function computeMenuPosition(rect: DOMRect, viewportHeight: number): MenuPosition {
  const spaceBelow = viewportHeight - rect.bottom - MENU_GAP - VIEWPORT_MARGIN;
  const spaceAbove = rect.top - MENU_GAP - VIEWPORT_MARGIN;
  const openUp = spaceBelow < FLIP_THRESHOLD && spaceAbove > spaceBelow;
  const available = openUp ? spaceAbove : spaceBelow;
  const maxHeight = Math.max(Math.min(available, MENU_MAX_HEIGHT), MENU_MIN_HEIGHT);
  return openUp
    ? { bottom: viewportHeight - rect.top + MENU_GAP, left: rect.left, width: rect.width, maxHeight }
    : { top: rect.bottom + MENU_GAP, left: rect.left, width: rect.width, maxHeight };
}

export default function Dropdown({
  options,
  activeId,
  onSelect,
  label,
  isOpen: controlledIsOpen,
  onToggle,
}: DropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(controlledIsOpen ?? false);
  const [dropdownPosition, setDropdownPosition] = useState<MenuPosition>({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: MENU_MAX_HEIGHT,
  });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!dropdownRef.current || !buttonRef.current || !(event.target instanceof Node)) return;
      if (!dropdownRef.current.contains(event.target) && !buttonRef.current.contains(event.target)) {
        if (onToggle) onToggle(false);
        else setIsOpen(false);
      }
    };

    if (controlledIsOpen || isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [controlledIsOpen, isOpen, onToggle]);

  useEffect(() => {
    const updatePosition = () => {
      if ((controlledIsOpen ?? isOpen) && buttonRef.current && mounted) {
        const rect = buttonRef.current.getBoundingClientRect();
        setDropdownPosition(computeMenuPosition(rect, window.innerHeight));
      }
    };

    updatePosition();

    if ((controlledIsOpen ?? isOpen) && mounted) {
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [controlledIsOpen, isOpen, mounted]);

  const activeOption = options.find((option) => option.id === activeId) || null;

  const handleSelect = (option: { id: number }) => {
    onSelect(option.id);
    if (onToggle) onToggle(false);
    else setIsOpen(false);
  };

  const toggleDropdown = () => {
    if (onToggle) onToggle(!isOpen);
    else setIsOpen((prev) => !prev);
  };

  const dropdownMenu = (controlledIsOpen ?? isOpen) && mounted ? (
    <div 
      ref={dropdownRef}
      className="dropdown-menu"
      style={{
        position: 'fixed',
        top: dropdownPosition.top,
        bottom: dropdownPosition.bottom,
        left: dropdownPosition.left,
        width: dropdownPosition.width,
        maxHeight: dropdownPosition.maxHeight,
        marginTop: 0,
        zIndex: 999999
      }}
    >
      {options.length === 0 ? (
        <div className="dropdown-item text-center">
          No teams available
        </div>
      ) : (
        options.map((option) => (
          <div
            key={option.id}
            onClick={() => handleSelect(option)}
            className={`dropdown-item ${activeOption?.id === option.id ? 'active' : ''}`}
          >
            {option.name}
          </div>
        ))
      )}
    </div>
  ) : null;

  return (
    <>
      <div className="relative w-full">
        <button
          ref={buttonRef}
          type="button"
          onClick={toggleDropdown}
          className="dropdown-button"
        >
          <span>
            {activeOption ? activeOption.name : label}
          </span>
          <svg
            className={`icon-sm transition-transform duration-200 ${(controlledIsOpen ?? isOpen) ? 'rotate-180' : ''}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a 1 1 0 01-1.414 0l-4-4a 1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
      
      {mounted && typeof document !== 'undefined' && dropdownMenu ? 
        createPortal(dropdownMenu, document.body) : null
      }
    </>
  );
}