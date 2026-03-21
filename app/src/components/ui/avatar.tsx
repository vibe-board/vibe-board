import type { Component } from 'solid-js';
import { cn } from '@/lib/cn';

interface AvatarProps {
  name: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
  class?: string;
}

const sizeMap = { sm: 'h-6 w-6 text-[10px]', md: 'h-8 w-8 text-xs', lg: 'h-10 w-10 text-sm' };

export const Avatar: Component<AvatarProps> = (props) => {
  const initials = () => {
    const parts = props.name.split(/[\s_-]+/);
    return parts.slice(0, 2).map(p => p[0]?.toUpperCase()).join('');
  };

  return (
    <div class={cn(
      'inline-flex items-center justify-center rounded-full bg-accent/20 text-accent font-medium shrink-0',
      sizeMap[props.size ?? 'md'],
      props.class,
    )}>
      {props.src ? (
        <img src={props.src} alt={props.name} class="h-full w-full rounded-full object-cover" />
      ) : (
        initials()
      )}
    </div>
  );
};
