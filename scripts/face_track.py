import cv2, json, sys, mediapipe as mp
src, out = sys.argv[1], sys.argv[2]
cap = cv2.VideoCapture(src); fps = cap.get(cv2.CAP_PROP_FPS); n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
W, H = cap.get(3), cap.get(4); det = mp.solutions.face_detection.FaceDetection(model_selection=1, min_detection_confidence=.5)
res = []
for f in range(0, n, int(fps)):
    cap.set(cv2.CAP_PROP_POS_FRAMES, f); ok, img = cap.read()
    if not ok: break
    sc = 1280 / max(W, H)  # keep the aspect ratio: squashing a portrait frame hides the face
    r = det.process(cv2.cvtColor(cv2.resize(img, (round(W * sc), round(H * sc))), cv2.COLOR_BGR2RGB))
    if r.detections:
        b = r.detections[0].location_data.relative_bounding_box
        res.append({"ms": round(f / fps * 1000), "cx": round(b.xmin + b.width / 2, 4), "cy": round(b.ymin + b.height / 2, 4), "w": round(b.width, 4), "h": round(b.height, 4)})
json.dump({"width": W, "height": H, "samples": res}, open(out, "w"), indent=1)
import statistics as s
print(len(res), {k: (round(min(x[k] for x in res),3), round(s.median(x[k] for x in res),3), round(max(x[k] for x in res),3)) for k in ("cx","cy","w","h")})
