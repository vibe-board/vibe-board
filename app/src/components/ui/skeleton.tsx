import type { Component } from 'solid-js';
import { cn } from '@/lib/cn';

interface SkeletonProps {
  class?: string;
}

export const Skeleton: Component<SkeletonProps> = (props) => {
  return (
    <div class={cn('animate-pulse rounded-md bg-surface-2', props.class)} />
  );
};
