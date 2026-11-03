import { HALO_COLOR, annotationColor } from "@/components/annotations/annotation-colors";
import { ANNOTATION_LABEL_NAMES, ANNOTATION_SHAPE_LABELS } from "@/lib/domain/constants";
import type { ID } from "@/lib/domain/types";
import type { ReportImage } from "@/lib/report/images";
import type { ReportAnnotation, ReportPhoto } from "@/lib/report/model";
import { cn } from "@/lib/cn";

/**
 * A photograph with its annotations, drawn with the same technique as the
 * annotation workspace: an SVG whose viewBox is the original's pixel size,
 * stretched exactly over an image box with the original's aspect ratio. Shapes
 * are stored as fractions of the original, so they line up with the
 * downscaled print copy. Without `highlight`, all annotations are shown; with
 * it, the listed annotations are emphasised and the others dimmed.
 */
export function ReportFigure({
  photo,
  image,
  highlight,
  size,
  caption,
}: {
  photo: ReportPhoto;
  /** Undefined while the print copy is still being prepared. */
  image: ReportImage | undefined;
  highlight?: ReadonlySet<ID>;
  size: "evidence" | "register";
  caption?: string;
}) {
  const { width: W, height: H } = photo.photo;
  const unit = Math.max(W, H);
  const listed = highlight ? photo.annotations.filter((a) => highlight.has(a.annotation.id)) : photo.annotations;
  const placeholder =
    image === undefined
      ? "Preparing image…"
      : image.status === "missing"
        ? "The original image is missing from storage. Annotation positions are shown on a blank frame."
        : image.status === "failed"
          ? `${image.message} Annotation positions are shown on a blank frame.`
          : null;

  return (
    <figure className="report-figure space-y-2" data-photo-id={photo.photo.id} data-figure-size={size}>
      <div
        className={cn("relative mx-auto bg-slate-200 ring-1 ring-slate-300", size === "evidence" ? "report-figure-evidence" : "report-figure-register")}
        style={{ aspectRatio: `${W} / ${H}`, width: `min(100%, calc(var(--report-figure-max-h) * ${W / H}))` }}
        data-testid="report-figure-frame"
        data-image-status={image?.status ?? "preparing"}
      >
        {image?.status === "ready" ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL; next/image cannot optimise it
          <img src={image.url} alt={`${photo.ref}: ${photo.photo.fileName}`} className="absolute inset-0 size-full" />
        ) : (
          <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-slate-700" role="status">
            {placeholder}
          </p>
        )}
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
          aria-hidden="true"
          data-testid="report-overlay"
        >
          {photo.annotations.map((item) => (
            <ReportShape key={item.annotation.id} item={item} W={W} H={H} unit={unit} dimmed={highlight ? !highlight.has(item.annotation.id) : false} />
          ))}
        </svg>
      </div>
      <figcaption className="space-y-1 text-xs text-slate-600">
        <p>
          <span className="font-semibold text-slate-900">{photo.ref}</span> · {photo.photo.fileName}
          {caption ? ` · ${caption}` : null}
        </p>
        {listed.length > 0 ? (
          <ul className="flex flex-wrap gap-x-4 gap-y-0.5" aria-label={`Annotations on ${photo.ref}`}>
            {listed.map(({ annotation, number }) => (
              <li key={annotation.id} className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block size-2.5 rounded-full ring-1 ring-slate-500"
                  style={{ backgroundColor: annotationColor(annotation.label) }}
                  aria-hidden="true"
                />
                #{number} {ANNOTATION_SHAPE_LABELS[annotation.shape.kind]}
                {annotation.label ? ` · ${ANNOTATION_LABEL_NAMES[annotation.label]}` : " · Unlabelled"}
              </li>
            ))}
          </ul>
        ) : null}
        {highlight && photo.annotations.length > listed.length ? (
          <p>Other annotations on this photograph are shown dimmed.</p>
        ) : null}
      </figcaption>
    </figure>
  );
}

function ReportShape({ item, W, H, unit, dimmed }: { item: ReportAnnotation; W: number; H: number; unit: number; dimmed: boolean }) {
  const { annotation, number } = item;
  const { shape } = annotation;
  const color = annotationColor(annotation.label);
  // Badge and point sizes scale with the image so they print at a readable size.
  const r = unit * 0.016;
  const badge = (x: number, y: number) => (
    <g>
      <circle cx={x + r} cy={y + r} r={r} fill={HALO_COLOR} stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <text
        x={x + r}
        y={y + r}
        fill="#ffffff"
        fontSize={r * 1.2}
        fontWeight={700}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        {number}
      </text>
    </g>
  );

  if (shape.kind === "rect") {
    const x = shape.x * W;
    const y = shape.y * H;
    return (
      <g data-annotation-id={annotation.id} data-dimmed={dimmed || undefined} opacity={dimmed ? 0.35 : 1}>
        <rect x={x} y={y} width={shape.width * W} height={shape.height * H} fill="none" stroke={HALO_COLOR} strokeWidth={5} strokeOpacity={0.7} vectorEffect="non-scaling-stroke" />
        <rect
          data-shape="rect"
          x={x}
          y={y}
          width={shape.width * W}
          height={shape.height * H}
          fill={color}
          fillOpacity={dimmed ? 0 : 0.12}
          stroke={color}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
        {badge(x, y)}
      </g>
    );
  }
  const cx = shape.x * W;
  const cy = shape.y * H;
  return (
    <g data-annotation-id={annotation.id} data-dimmed={dimmed || undefined} opacity={dimmed ? 0.35 : 1}>
      <circle data-shape="point" cx={cx} cy={cy} r={unit * 0.008} fill={color} stroke={HALO_COLOR} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      {badge(cx + r * 0.6, cy - r * 2.6)}
    </g>
  );
}
