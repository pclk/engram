import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppErrorBoundary } from '@/src/components/AppErrorBoundary';

function CrashOnRender(): never {
  throw new Error('Boom');
}

describe('AppErrorBoundary', () => {
  it('renders fallback UI when a child throws', () => {
    render(
      <AppErrorBoundary>
        <CrashOnRender />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });
});
