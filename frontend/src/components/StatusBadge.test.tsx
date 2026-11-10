import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { APPLICATION_STATUSES, STATUS_LABELS } from '../api/status';
import { StatusBadge, StatusDot } from './StatusBadge';

describe('StatusBadge', () => {
  it.each(APPLICATION_STATUSES)('muestra el nombre en español de "%s"', (status) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(STATUS_LABELS[status])).toBeInTheDocument();
  });

  it('el punto de color es decorativo: el nombre es lo único que lee el lector de pantalla', () => {
    const { container } = render(<StatusBadge status="interview" />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    expect(container).toHaveTextContent(/^Entrevista$/);
  });
});

describe('StatusDot', () => {
  it('no tiene texto y se oculta al lector de pantalla', () => {
    const { container } = render(<StatusDot status="offer" />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container).toHaveTextContent('');
  });
});
