import "./App.css";
import WorkSpace from "./components/workSpace/workSpace";
import HomePage from "./components/homepage/homePage";
import { useSelector } from "react-redux";
import MiddlePage from "./components/middlePage/middlePage";
function App() {
  const user = useSelector((state: any) => state.auth);
  const whiteBoard = useSelector((state: any) => state.whiteBoard);
  return (
    <div className="App">
      {!user?.isAuthenticated ? (
        <HomePage />
      ) : whiteBoard.id !== null ? (
        <WorkSpace />
      ) : (
        <MiddlePage />
      )}
    </div>
  );
}

export default App;
