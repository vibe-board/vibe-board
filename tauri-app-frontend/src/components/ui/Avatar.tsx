import { twMerge } from 'tailwind-merge';

interface AvatarProps {
  name?: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeStyles = {
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-10 h-10 text-base',
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function hashColor(name: string): string {
  const colors = ['#5e6ad2', '#3ecf8e', '#f5a623', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={name ?? ''}
        className={twMerge('rounded-full object-cover', sizeStyles[size], className)}
      />
    );
  }

  return (
    <div
      className={twMerge(
        'rounded-full flex items-center justify-center font-semibold text-white',
        sizeStyles[size],
        className,
      )}
      style={{ backgroundColor: name ? hashColor(name) : '#5e6ad2' }}
    >
      {name ? getInitials(name) : '?'}
    </div>
  );
}
