import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TabErrorBoundary } from '../TabErrorBoundary';

let shouldThrow = true;
function Boom() {
  if (shouldThrow) throw new Error('boom');
  return <div>recovered</div>;
}

beforeEach(() => {
  shouldThrow = true;
  // React logs caught render errors to console.error — silence for clean output.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('TabErrorBoundary', () => {
  it('isolates a throwing child and keeps siblings rendered', () => {
    render(
      <>
        <TabErrorBoundary tabKey="a">
          <Boom />
        </TabErrorBoundary>
        <div data-testid="sibling">ok</div>
      </>
    );
    expect(screen.getByTestId('sibling')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /reload tab/i })
    ).toBeInTheDocument();
  });

  it('remounts children when "Reload tab" is clicked after the cause is fixed', () => {
    render(
      <TabErrorBoundary tabKey="a">
        <Boom />
      </TabErrorBoundary>
    );
    // fix the cause, then reload
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: /reload tab/i }));
    expect(screen.getByText('recovered')).toBeInTheDocument();
  });
});
