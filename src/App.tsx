import "./App.css";
import WorkSpace from "./components/workSpace/workSpace";
import HomePage from "./components/homepage/homePage";
import { useDispatch, useSelector } from "react-redux";
import MiddlePage from "./components/middlePage/middlePage";
import { useEffect } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "./config/firebase";
import { setSearchableBoards } from "./features/boards/boards";
function App() {
  const user = useSelector((state: any) => state.auth);
  const whiteBoard = useSelector((state: any) => state.whiteBoard);
  const dispatch = useDispatch();

  const boardCollectionRef = collection(db, "boards");

  useEffect(() => {
    const preventZoom = (e: {
      ctrlKey: any;
      key: string;
      type: string;
      preventDefault: () => void;
    }) => {
      // Prevent zoom with Ctrl + Scroll or Ctrl + +/- keys
      if (
        (e.ctrlKey && (e.key === "+" || e.key === "-" || e.key === "=")) ||
        (e.ctrlKey && e.type === "wheel")
      ) {
        e.preventDefault();
      }
    };

    const preventWheelZoom = (e: {
      ctrlKey: any;
      preventDefault: () => void;
    }) => {
      if (e.ctrlKey) {
        e.preventDefault();
      }
    };

    // Attach event listeners
    document.addEventListener("keydown", preventZoom);
    document.addEventListener("wheel", preventWheelZoom, { passive: false });

    // Cleanup on unmount
    return () => {
      document.removeEventListener("keydown", preventZoom);
      document.removeEventListener("wheel", preventWheelZoom);
    };
  }, []);
  useEffect(() => {
    const search = query(boardCollectionRef, where("type", "==", "public"));

    const unsubscribe = onSnapshot(search, (querySnapshot) => {
      const boards: any = [];
      querySnapshot.forEach((doc) => {
        boards.push({
          id: doc.id,
          title: doc.data().title,
          uid: doc.data().uid,
        });
      });

      dispatch(setSearchableBoards({ boards: boards }));
    });

    return () => unsubscribe();
  }, [boardCollectionRef, dispatch]);

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
