import { Cache } from '../../assets/cache/Cache';
import { ObservablePoint } from '../../maths/ObservablePoint';
import { emptyViewObserver } from '../renderers/shared/View';
import { BitmapFontManager } from './bitmap/BitmapFontManager';
import { CanvasTextMetrics } from './canvas/CanvasTextMetrics';
import { measureHtmlText } from './html/utils/measureHtmlText.';
import { HTMLTextStyle } from './HtmlTextStyle';
import { ensureTextStyle } from './shared/utils/ensureTextStyle';

import type { PointData } from '../../maths/PointData';
import type { View, ViewObserver } from '../renderers/shared/View';
import type { Bounds } from '../scene/bounds/Bounds';
import type { TextureDestroyOptions, TypeOrBool } from '../scene/destroyTypes';
import type { HTMLTextStyleOptions } from './HtmlTextStyle';
import type { TextStyle, TextStyleOptions } from './TextStyle';

export type TextString = string | number | {toString: () => string};
export type AnyTextStyle = TextStyle | HTMLTextStyle;

type Filter<T> = { [K in keyof T]: {
    text?: TextString;
    renderMode?: K;
    resolution?: number;
    style?: T[K]
} } [keyof T];

export type TextStyles = {
    canvas: TextStyleOptions | TextStyle;
    html: HTMLTextStyleOptions | HTMLTextStyle;
    bitmap: TextStyleOptions | TextStyle;
};

export type TextViewOptions = Filter<TextStyles>;
const map = {
    canvas: 'text',
    html: 'htmlText',
    bitmap: 'bitmapText',
};

let uid = 0;

export class TextView implements View
{
    public static defaultResolution = 1;
    public static defaultAutoResolution = true;

    public readonly uid: number = uid++;
    public readonly type: string = 'text';
    public readonly owner: ViewObserver = emptyViewObserver;
    public batched = true;
    public anchor: ObservablePoint;

    /** @internal */
    public _autoResolution = TextView.defaultAutoResolution;
    /** @internal */
    public _resolution = TextView.defaultResolution;
    /** @internal */
    public _style: AnyTextStyle;
    /** @internal */
    public _didUpdate = true;

    private _bounds: [number, number, number, number] = [0, 1, 0, 0];
    private _boundsDirty = true;
    private _text: string;
    private readonly _renderMode: string;

    constructor(options: TextViewOptions)
    {
        this.text = options.text ?? '';

        const renderMode = options.renderMode ?? this._detectRenderType(options.style);

        this._renderMode = renderMode;

        this._style = ensureTextStyle(renderMode, options.style);

        this.type = map[renderMode];

        this.anchor = new ObservablePoint(this, 0, 0);

        this._resolution = options.resolution ?? TextView.defaultResolution;

        this._autoResolution = !options.resolution ?? TextView.defaultAutoResolution;
    }

    set text(value: TextString)
    {
        // check its a string
        value = value.toString();

        if (this._text === value) return;

        this._text = value as string;
        this.onUpdate();
    }

    get text(): string
    {
        return this._text;
    }

    get style(): AnyTextStyle
    {
        return this._style;
    }

    set style(style: AnyTextStyle | Partial<AnyTextStyle>)
    {
        style = style || {};

        this._style?.off('update', this.onUpdate, this);

        this._style = ensureTextStyle(this._renderMode, style);

        this._style.on('update', this.onUpdate, this);
        this.onUpdate();
    }

    set resolution(value: number)
    {
        this._resolution = value;
    }

    get resolution(): number
    {
        return this._resolution;
    }

    get bounds()
    {
        if (this._boundsDirty)
        {
            this._updateBounds();
            this._boundsDirty = false;
        }

        return this._bounds;
    }

    public addBounds(bounds: Bounds)
    {
        const _bounds = this.bounds;

        bounds.addFrame(
            _bounds[0],
            _bounds[1],
            _bounds[2],
            _bounds[3],
        );
    }

    public containsPoint(point: PointData)
    {
        const width = this.bounds[2];
        const height = this.bounds[3];
        const x1 = -width * this.anchor.x;
        let y1 = 0;

        if (point.x >= x1 && point.x < x1 + width)
        {
            y1 = -height * this.anchor.y;

            if (point.y >= y1 && point.y < y1 + height) return true;
        }

        return false;
    }

    /** @internal */
    public onUpdate()
    {
        this._didUpdate = true;
        this._boundsDirty = true;
        this.owner.onViewUpdate();
    }

    /** @internal */
    public _getKey(): string
    {
        // TODO add a dirty flag...
        return `${this.text}:${this._style.styleKey}`;
    }

    private _updateBounds()
    {
        const bounds = this._bounds;
        const padding = this._style.padding;

        if (this.type === 'bitmapText')
        {
            const bitmapMeasurement = BitmapFontManager.measureText(this.text, this._style);
            const scale = bitmapMeasurement.scale;
            const offset = bitmapMeasurement.offsetY * scale;

            bounds[0] = -padding;
            bounds[1] = offset - padding;
            bounds[2] = (bitmapMeasurement.width * scale) - padding;
            bounds[3] = ((bitmapMeasurement.height * scale) + offset) - padding;
        }
        else if (this.type === 'htmlText')
        {
            const htmlMeasurement = measureHtmlText(this.text, this._style as HTMLTextStyle);

            bounds[0] = -padding;
            bounds[1] = -padding;
            bounds[2] = htmlMeasurement.width - padding;
            bounds[3] = htmlMeasurement.height - padding;
        }
        else
        {
            const canvasMeasurement = CanvasTextMetrics.measureText(this.text, this._style);

            bounds[0] = -padding;
            bounds[1] = -padding;
            bounds[2] = canvasMeasurement.width - padding;
            bounds[3] = canvasMeasurement.height - padding;
        }
    }

    private _detectRenderType(style: TextStyleOptions | AnyTextStyle): 'canvas' | 'html' | 'bitmap'
    {
        if (style instanceof HTMLTextStyle)
        {
            return 'html';
        }

        return Cache.has(style?.fontFamily as string) ? 'bitmap' : 'canvas';
    }

    /**
     * Destroys this text renderable and optionally its style texture.
     * @param options - Options parameter. A boolean will act as if all options
     *  have been set to that value
     * @param {boolean} [options.texture=false] - Should it destroy the texture of the text style
     * @param {boolean} [options.textureSource=false] - Should it destroy the textureSource of the text style
     */
    public destroy(options: TypeOrBool<TextureDestroyOptions> = false): void
    {
        (this as any).owner = null;
        this._bounds = null;
        this.anchor = null;

        this._style.destroy(options);
        this._style = null;
        this._text = null;
    }
}