import React, { useRef, useState } from "react";
import { Button, Rows, Text, Alert, TextInput, SegmentedControl, FormField } from "@canva/app-ui-kit";
import { addElementAtCursor, addElementAtPoint } from "@canva/design";
import { upload } from "@canva/asset";
import { useFeatureSupport } from "@canva/app-hooks";
import * as styles from "styles/components.css";
// @ts-ignore
import ImageTracer from "imagetracerjs";

export const App = () => {
  const isSupported = useFeatureSupport();
  const addElement = [addElementAtPoint, addElementAtCursor].find((fn) =>
    isSupported(fn),
  );
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [activeTab, setActiveTab] = useState<"image" | "ai">("image");

  // AI to Frame state
  const [aiPrompt, setAiPrompt] = useState("");

  const generateSvgFromImageData = (imgd: ImageData, maxPaths: number) => {
    const svgStr = ImageTracer.imagedataToSVG(imgd, { 
      ltres: 3,
      qtres: 3,
      pathomit: 20,
      numberofcolors: 2, 
      scale: 1 
    });
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgStr, "image/svg+xml");
    const pathElements = doc.querySelectorAll("path");
    
    const paths = [];
    let totalLength = 0;
    
    for (let i = 1; i < pathElements.length; i++) {
      let d = pathElements[i].getAttribute("d");
      if (d) {
        d = d.replace(/Q\s+[-.\d]+\s+[-.\d]+\s+([-.\d]+)\s+([-.\d]+)/gi, 'L $1 $2');
        const subPaths = d.split(/(?=[Mm])/).filter(p => p.trim() !== "");
        
        for (const subPath of subPaths) {
          if (paths.length >= maxPaths) break;
          paths.push({
            d: subPath.trim(),
            fill: {
              dropTarget: true,
            },
          });
          totalLength += subPath.length;
        }
      }
      if (paths.length >= maxPaths) break;
    }
    return { paths, totalLength };
  };

  const processAIPrompt = async () => {
    if (!aiPrompt.trim()) {
      setErrorMsg("Please enter a prompt to generate a shape.");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      const engineeredPrompt = `${aiPrompt.trim()} shape, solid black silhouette on pure solid white background, flat vector style, no details, isolated, minimal`;
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(engineeredPrompt)}?width=800&height=800&nologo=true`;

      // Fetch the image
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("AI generation failed. Please try again.");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      
      const img = new Image();
      img.crossOrigin = "anonymous";
      
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load AI image."));
        img.src = objectUrl;
      });

      const width = img.naturalWidth;
      const height = img.naturalHeight;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Failed to initialize canvas.");

      // Draw the AI image
      ctx.drawImage(img, 0, 0);

      // Clean up object URL
      URL.revokeObjectURL(objectUrl);

      const imgd = ctx.getImageData(0, 0, width, height);
      const numPixels = width * height;

      // Thresholding: Make dark pixels pitch black, bright pixels solid white
      for (let i = 0; i < numPixels; i++) {
        const dataIdx = i * 4;
        const r = imgd.data[dataIdx];
        const g = imgd.data[dataIdx + 1];
        const b = imgd.data[dataIdx + 2];
        
        // Calculate luminance
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        
        // If luminance is dark, make it our black shape to trace
        if (luminance < 128) {
          imgd.data[dataIdx] = 0;
          imgd.data[dataIdx + 1] = 0;
          imgd.data[dataIdx + 2] = 0;
          imgd.data[dataIdx + 3] = 255;
        } else {
          // Otherwise, make it solid white background
          imgd.data[dataIdx] = 255;
          imgd.data[dataIdx + 1] = 255;
          imgd.data[dataIdx + 2] = 255;
          imgd.data[dataIdx + 3] = 255;
        }
      }

      // Put the thresholded image back to canvas to upload as the mask image
      ctx.putImageData(imgd, 0, 0);
      
      // Extract SVG paths (allow more paths for complex AI shapes)
      const { paths, totalLength } = generateSvgFromImageData(imgd, 40);

      if (paths.length === 0) {
        throw new Error("No clear shape could be identified from the AI generation. Try a simpler prompt.");
      }
      if (totalLength > 4000) {
        throw new Error("Generated shape is too complex. Try adding words like 'simple' or 'minimal' to your prompt.");
      }

      const dataUrl = canvas.toDataURL("image/png");

      const thumbCanvas = document.createElement("canvas");
      const MAX_THUMB_SIZE = 400;
      thumbCanvas.width = MAX_THUMB_SIZE;
      thumbCanvas.height = Math.floor(MAX_THUMB_SIZE * (height/width));
      const thumbCtx = thumbCanvas.getContext("2d");
      thumbCtx?.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
      const thumbUrl = thumbCanvas.toDataURL("image/jpeg", 0.7);

      const asset = await upload({
        type: "image",
        mimeType: "image/png",
        url: dataUrl,
        thumbnailUrl: thumbUrl,
        aiDisclosure: "generated", // Disclose AI generation to Canva!
      });
      await asset.whenUploaded();

      if (addElement) {
        addElement({
          type: "group",
          children: [
            {
              type: "image",
              ref: asset.ref,
              width: width,
              height: height,
              top: 0,
              left: 0,
            },
            {
              type: "shape",
              paths: paths,
              viewBox: {
                height: height,
                width: width,
                left: 0,
                top: 0,
              },
              width: width,
              height: height,
              top: 0,
              left: 0,
            }
          ],
        });
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to generate AI frame.");
    } finally {
      setLoading(false);
    }
  };

  const processImage = async (file: File) => {
    setLoading(true);
    setErrorMsg("");
    
    const url = URL.createObjectURL(file);
    const img = new Image();
    
    img.onload = async () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Failed to process image. Try uploading a different PNG file.");
        
        ctx.drawImage(img, 0, 0);
        const imgd = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/png");
        
        const width = canvas.width;
        const height = canvas.height;
        const numPixels = width * height;
        
        const isTransparent = new Uint8Array(numPixels);
        for (let i = 0; i < numPixels; i++) {
          if (imgd.data[i * 4 + 3] < 128) {
            isTransparent[i] = 1;
          }
        }

        const outerTransparent = new Uint8Array(numPixels);
        const queue = new Int32Array(numPixels);
        let head = 0;
        let tail = 0;
        
        for (let x = 0; x < width; x++) {
          const topIdx = x;
          const bottomIdx = (height - 1) * width + x;
          if (isTransparent[topIdx] && !outerTransparent[topIdx]) { 
              outerTransparent[topIdx] = 1; queue[tail++] = topIdx; 
          }
          if (isTransparent[bottomIdx] && !outerTransparent[bottomIdx]) { 
              outerTransparent[bottomIdx] = 1; queue[tail++] = bottomIdx; 
          }
        }
        for (let y = 0; y < height; y++) {
          const leftIdx = y * width;
          const rightIdx = y * width + width - 1;
          if (isTransparent[leftIdx] && !outerTransparent[leftIdx]) { 
              outerTransparent[leftIdx] = 1; queue[tail++] = leftIdx; 
          }
          if (isTransparent[rightIdx] && !outerTransparent[rightIdx]) { 
              outerTransparent[rightIdx] = 1; queue[tail++] = rightIdx; 
          }
        }

        while (head < tail) {
          const idx = queue[head++];
          const x = idx % width;
          const y = Math.floor(idx / width);
          
          if (y > 0) {
              const n = idx - width;
              if (isTransparent[n] && !outerTransparent[n]) { outerTransparent[n] = 1; queue[tail++] = n; }
          }
          if (y < height - 1) {
              const n = idx + width;
              if (isTransparent[n] && !outerTransparent[n]) { outerTransparent[n] = 1; queue[tail++] = n; }
          }
          if (x > 0) {
              const n = idx - 1;
              if (isTransparent[n] && !outerTransparent[n]) { outerTransparent[n] = 1; queue[tail++] = n; }
          }
          if (x < width - 1) {
              const n = idx + 1;
              if (isTransparent[n] && !outerTransparent[n]) { outerTransparent[n] = 1; queue[tail++] = n; }
          }
        }

        for (let i = 0; i < numPixels; i++) {
          const dataIdx = i * 4;
          if (isTransparent[i] && !outerTransparent[i]) {
            imgd.data[dataIdx] = 0;
            imgd.data[dataIdx + 1] = 0;
            imgd.data[dataIdx + 2] = 0;
            imgd.data[dataIdx + 3] = 255;
          } else {
            imgd.data[dataIdx] = 255;
            imgd.data[dataIdx + 1] = 255;
            imgd.data[dataIdx + 2] = 255;
            imgd.data[dataIdx + 3] = 255;
          }
        }
        
        const { paths, totalLength } = generateSvgFromImageData(imgd, 30);
        
        if (paths.length === 0) {
          throw new Error("No transparent area (hole) detected. Please ensure your PNG image has a fully transparent area in the center to create the frame.");
        }
        
        if (totalLength > 2000) {
          throw new Error("Image is too complex (SVG path too large). Please simplify the transparent shape edges and try again.");
        }
        
        const thumbCanvas = document.createElement("canvas");
        const MAX_THUMB_SIZE = 400;
        let thumbW = img.naturalWidth;
        let thumbH = img.naturalHeight;
        if (thumbW > thumbH) {
          if (thumbW > MAX_THUMB_SIZE) {
            thumbH *= MAX_THUMB_SIZE / thumbW;
            thumbW = MAX_THUMB_SIZE;
          }
        } else {
          if (thumbH > MAX_THUMB_SIZE) {
            thumbW *= MAX_THUMB_SIZE / thumbH;
            thumbH = MAX_THUMB_SIZE;
          }
        }
        thumbCanvas.width = thumbW;
        thumbCanvas.height = thumbH;
        const thumbCtx = thumbCanvas.getContext("2d");
        thumbCtx?.drawImage(img, 0, 0, thumbW, thumbH);
        const thumbUrl = thumbCanvas.toDataURL("image/jpeg", 0.7);

        const asset = await upload({
          type: "image",
          mimeType: "image/png",
          url: dataUrl,
          thumbnailUrl: thumbUrl,
          aiDisclosure: "none",
        });
        await asset.whenUploaded();
        
        if (addElement) {
          addElement({
            type: "group",
            children: [
              {
                type: "image",
                ref: asset.ref,
                width: img.naturalWidth,
                height: img.naturalHeight,
                top: 0,
                left: 0,
              },
              {
                type: "shape",
                paths: paths,
                viewBox: {
                  height: img.naturalHeight,
                  width: img.naturalWidth,
                  left: 0,
                  top: 0,
                },
                width: img.naturalWidth,
                height: img.naturalHeight,
                top: 0,
                left: 0,
              }
            ],
          });
        }
      } catch (err: any) {
        setErrorMsg(err.message || "Failed to convert the image. Please verify your image is a valid PNG with transparency.");
      } finally {
        URL.revokeObjectURL(url);
        setLoading(false);
      }
    };
    
    img.onerror = () => {
      setLoading(false);
      setErrorMsg("Image format not supported. Please ensure you upload a valid PNG image.");
      URL.revokeObjectURL(url);
    };
    
    img.src = url;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processImage(e.target.files[0]);
    }
  };

  return (
    <div className={styles.scrollContainer}>
      <Rows spacing="3u">
        <SegmentedControl
          value={activeTab}
          onChange={(val) => {
            setActiveTab(val as "image" | "ai");
            setErrorMsg("");
          }}
          options={[
            { value: "image", label: "Image to Frame" },
            { value: "ai", label: "AI to Frame" }
          ]}
        />
        
        {activeTab === "image" && (
          <Rows spacing="3u">
            <Text>Upload a transparent PNG to create a mockup frame.</Text>
            <input 
              type="file" 
              accept="image/png" 
              ref={fileInputRef} 
              style={{ display: "none" }} 
              onChange={handleFileChange} 
            />
            <Rows spacing="1u">
              <Button
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={!addElement || loading}
                stretch
              >
                {loading ? "Processing..." : "Choose file"}
              </Button>
              <Text size="small" tone="neutral">Maximum file size: 3MB</Text>
            </Rows>
          </Rows>
        )}

        {activeTab === "ai" && (
          <Rows spacing="3u">
            <Text>Describe a shape (e.g. "Cat", "Star") and AI will generate it as a custom frame.</Text>
            <FormField
              label="Shape Idea"
              control={(props) => (
                <TextInput
                  {...props}
                  value={aiPrompt}
                  onChange={(val) => setAiPrompt(val)}
                  placeholder="E.g., Heart, Star, Coffee cup..."
                  maxLength={50}
                />
              )}
            />
            <Button
              variant="primary"
              onClick={processAIPrompt}
              disabled={!addElement || loading || !aiPrompt.trim()}
              stretch
            >
              {loading ? "Generating AI Frame..." : "Generate AI Frame"}
            </Button>
          </Rows>
        )}

        {errorMsg && (
          <Alert tone="critical">{errorMsg}</Alert>
        )}
      </Rows>
    </div>
  );
};
