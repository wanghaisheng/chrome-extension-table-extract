import './button.css';
import { FunctionComponent, ComponentChildren, JSX } from 'preact';

interface Props extends Omit<JSX.HTMLAttributes<HTMLButtonElement>, 'onClick' | 'className' | 'children' | 'size'> {
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
  ...rest
}) => {
  return (
    <button
      type={type}
      className={`btn ${className} ${variant} ${size}`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
};

export default Button;
