import "./Loader.css";

function Loader({ text = "Loading..." }) {
  return (
    <div className="app-loader">
      <div className="app-loader-spinner" />
      <p>{text}</p>
    </div>
  );
}

export default Loader;