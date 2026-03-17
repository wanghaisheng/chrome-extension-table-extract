import './button.css';
import { FunctionComponent, ComponentChildren } from 'preact';

interface Props {
  onClick?: () => void;
  children: ComponentChildren;
  variant?: 'text' | 'primary' | 'secondary' | 'from';
  type?: string;
  className?: string;
  size?: 'small';
  disabled?: boolean;
}

const Button: FunctionComponent<Props> = ({
  onClick,
  className = '',
  variant = 'text',
  type,
  size = '',
  children,
  disabled = false,
}) => {
  return (
    <button
      type={type}
      className={`btn ${className} ${variant} ${size}`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-disabled={disabled}
    >
      {children}
    </button>
  );
};

export default Button;
