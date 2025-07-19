'use client';

import { useRef, useEffect, useState } from 'react';

type DropdownProps = {
  options: Array<{ id: number; name: string }>;
  activeId: number | null;
  onSelect: (id: number) => void;
  label: string;
  isOpen?: boolean;
  onToggle?: (isOpen: boolean) => void;
};

export default function Dropdown({
  options,
  activeId,
  onSelect,
  label,
  isOpen: controlledIsOpen,
  onToggle,
}: DropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(controlledIsOpen ?? false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!dropdownRef.current || !(event.target instanceof Node)) return;
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
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

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <button
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

      {(controlledIsOpen ?? isOpen) && (
        <div className="absolute z-50 w-full dropdown-menu">
          {options.length === 0 ? (
            <div className="dropdown-item text-center">
              No streams available
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
      )}
    </div>
  );
}