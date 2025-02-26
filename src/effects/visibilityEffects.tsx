import { useEffect } from "react";
import { AppDispatch } from "../store";
import { useSelector, useDispatch } from "react-redux";
import { setHideOptions } from "../features/hide/hide";

const ComponentVisibility = () => {
  const selectedShapes = useSelector(
    (state: any) => state.selected.selectedShapes
  );
  const dispatch = useDispatch<AppDispatch>();
  /*
    Hide useEffect:
    Responsibility -> Allows hiding of the options bar.
  */
  useEffect(() => {
    if (selectedShapes.length === 0) {
      dispatch(setHideOptions(true));
    } else {
      dispatch(setHideOptions(false));
    }
  }, [dispatch, selectedShapes]);

  return null;
};

export default ComponentVisibility;
