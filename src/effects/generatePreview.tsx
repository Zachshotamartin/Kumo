import { useEffect } from "react";
import { useSelector } from "react-redux";
import { ref as storageRef, uploadBytes } from "firebase/storage";
import { storage } from "../config/firebase";

const domtoimage = require("dom-to-image");

const GeneratePreview = () => {
  const board = useSelector((state: any) => state.whiteBoard);
  useEffect(() => {
    const generatePreview = () => {
      const element = document.getElementById("whiteboard");
      domtoimage
        .toJpeg(element, { quality: 0.2 })
        .then((dataUrl: string) => {
          const image = new Image();
          image.src = dataUrl;

          // Correctly convert the dataUrl to a Blob
          const base64Data = dataUrl.split(",")[1];
          if (!base64Data) {
            console.error("Invalid data URL format");
            return;
          }
          const byteString = atob(base64Data); // Decode Base64 string
          const arrayBuffer = new ArrayBuffer(byteString.length);
          const uint8Array = new Uint8Array(arrayBuffer);

          for (let i = 0; i < byteString.length; i++) {
            uint8Array[i] = byteString.charCodeAt(i);
          }

          const blob = new Blob([uint8Array], { type: "image/jpeg" });

          // Upload the Blob to Firebase Storage
          const fileRef = storageRef(storage, `boardPreviews/${board.id}.jpg`);
          uploadBytes(fileRef, blob)
            .then((snapshot) => {
              console.log("File uploaded successfully!");
            })
            .catch((error) => {
              console.error("Error uploading file:", error);
            });
        })
        .catch((error: any) => {
          console.error("Error generating preview:", error);
        });
    };

    generatePreview();
  }, [board.id]);
  return null;
};

export default GeneratePreview;
