import './Backdrop.css';

interface BackdropProps {
  onClose: () => void;
}

export function Backdrop(props: BackdropProps) {
  return <div className="backdrop" onClick={props.onClose} />;
}
