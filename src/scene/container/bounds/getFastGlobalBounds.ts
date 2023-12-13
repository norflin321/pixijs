import { Matrix } from '../../../maths/matrix/Matrix';
import { getBounds, returnBounds } from './utils/boundsPool';

import type { Container } from '../Container';
import type { Bounds } from './Bounds';

// TODO could we cache local bounds on the render groups?

const tempMatrix = new Matrix();

/**
 * Does exactly the same as getGlobalBounds, but does instead makes use of transforming AABBs
 * of the various children within the scene graph. This is much faster, but less accurate.
 *
 * the result will never be smaller - only ever slightly larger (in most cases, it will be the same).
 * @param target - The target container to get the bounds from
 * @param bounds - The output bounds object.
 * @returns The bounds.
 */
export function getFastGlobalBounds(target: Container, bounds: Bounds): Bounds
{
    bounds.clear();

    _getGlobalBoundsRecursive(target, bounds);

    if (!target.isRenderGroupRoot)
    {
        bounds.applyMatrix(target.renderGroup.worldTransform);
    }

    if (!bounds.isValid)
    {
        bounds.set(0, 0, 0, 0);
    }

    return bounds;
}

export function _getGlobalBoundsRecursive(
    target: Container,
    bounds: Bounds,
)
{
    if (target.localVisibleRenderable !== 0b11 || !target.measurable)
    {
        return;
    }

    const manageEffects = !!target.effects.length;

    let localBounds = bounds;

    if (target.isRenderGroupRoot || manageEffects)
    {
        localBounds = getBounds().clear();
    }

    if (target.boundsArea)
    {
        bounds.addRect(target.boundsArea, target.worldTransform);
    }
    else
    {
        if (target.view)
        {
            const viewBounds = target.view.bounds;

            localBounds.addFrame(
                viewBounds.minX,
                viewBounds.minY,
                viewBounds.maxX,
                viewBounds.maxY,
                target.rgTransform
            );
        }

        const children = target.children;

        for (let i = 0; i < children.length; i++)
        {
            _getGlobalBoundsRecursive(children[i], localBounds);
        }
    }

    if (manageEffects)
    {
        let advanced = false;

        for (let i = 0; i < target.effects.length; i++)
        {
            if (target.effects[i].addBounds)
            {
                if (!advanced)
                {
                    advanced = true;
                    localBounds.applyMatrix(target.renderGroup.worldTransform);
                }

                target.effects[i].addBounds?.(localBounds);
            }
        }

        if (advanced)
        {
            localBounds.applyMatrix(target.renderGroup.worldTransform.copyTo(tempMatrix).invert());
            bounds.addBounds(localBounds, target.rgTransform);
        }

        bounds.addBounds(localBounds);
        returnBounds(localBounds);
    }
    else if (target.isRenderGroupRoot)
    {
        bounds.addBounds(localBounds, target.rgTransform);
        returnBounds(localBounds);
    }
}