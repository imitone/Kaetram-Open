import _ from 'lodash';

import * as Modules from '@kaetram/common/src/modules';

import Transition from '../../utils/transition';
import Animation from '../animation';
import Entity from '../entity';
import EntityHandler from '../entityhandler';

import type Weapon from './player/equipment/weapon';

export default class Character extends Entity {
    public teleporting!: boolean;

    public weapon!: Weapon;

    public nextGridX = -1;
    public nextGridY = -1;

    // private prevGridX = -1;
    // private prevGridY = -1;

    public orientation = Modules.Orientation.Down;

    public hitPoints = -1;
    public maxHitPoints = -1;
    public mana = -1;
    public maxMana = -1;

    public healthBarVisible = false;

    public dead = false;
    private following = false;
    // private attacking = false;
    private interrupted = false;

    public critical = false;
    public frozen = false;
    public stunned = false;
    public explosion = false;
    public healing = false;

    public path: number[][] | null = null;
    public target: Entity | null = null;

    private attackers: { [id: string]: Character } = {};

    public movement = new Transition();

    private readonly attackAnimationSpeed = 50;
    private readonly walkAnimationSpeed = 100;
    public movementSpeed = -1;

    public attackRange = 1;

    private criticalAnimation!: Animation;
    private terrorAnimation!: Animation;
    public terror!: boolean;
    private stunAnimation!: Animation;
    private explosionAnimation!: Animation;
    private healingAnimation!: Animation;

    public spriteFlipX!: boolean;
    public spriteFlipY!: boolean;

    public gridX!: number;
    public gridY!: number;

    private newDestination!: Pos | null;
    private step!: number;
    private healthBarTimeout!: number | null;

    private secondStepCallback?(): void;
    private beforeStepCallback?(): void;
    private stepCallback?(): void;
    private stopPathingCallback?(gridX: number, gridY: number, forced?: boolean): void;
    private startPathingCallback?(path: number[][]): void;
    private moveCallback?(): void;
    private requestPathCallback?(x: number, y: number): number[][] | null;
    private hitPointsCallback?(hitPoints: number): void;
    private maxHitPointsCallback?(maxHitPoints: number): void;

    public instance!: string;
    public type!: string;
    private forced!: boolean;

    public handler = new EntityHandler(this);

    public constructor(id: string, kind: string) {
        super(id, kind);

        this.loadGlobals();
    }

    private loadGlobals(): void {
        // Critical Hit Animation
        const critical = new Animation('atk_down', 10, 0, 48, 48);
        critical.setSpeed(30);

        critical.setCount(1, () => {
            this.critical = false;

            critical.reset();
            critical.count = 1;
        });
        this.criticalAnimation = critical;

        // Terror Animation
        const terror = new Animation('explosion', 8, 0, 64, 64);
        terror.setSpeed(50);

        terror.setCount(1, () => {
            this.terror = false;

            terror.reset();
            terror.count = 1;
        });
        this.terrorAnimation = terror;

        // Stunned Animation
        const stun = new Animation('atk_down', 6, 0, 48, 48);
        stun.setSpeed(30);
        this.stunAnimation = stun;

        // Explosion Animation
        const explosion = new Animation('explosion', 8, 0, 64, 64);
        explosion.setSpeed(50);

        explosion.setCount(1, () => {
            this.explosion = false;

            explosion.reset();
            explosion.count = 1;
        });
        this.explosionAnimation = explosion;

        // Healing Animation
        const healing = new Animation('explosion', 8, 0, 48, 48);
        healing.setSpeed(50);

        healing.setCount(1, () => {
            this.healing = false;

            healing.reset();
            healing.count = 1;
        });
        this.healingAnimation = healing;
    }

    public animate(
        animation: string,
        speed: number,
        count?: number,
        onEndCount?: () => void
    ): void {
        const o = ['atk', 'walk', 'idle'];
        const { orientation, currentAnimation } = this;

        if (currentAnimation?.name === 'death') return;

        this.spriteFlipX = false;
        this.spriteFlipY = false;

        if (o.includes(animation)) {
            animation += `_${
                orientation === Modules.Orientation.Left
                    ? 'right'
                    : this.orientationToString(orientation)
            }`;
            this.spriteFlipX = orientation === Modules.Orientation.Left;
        }

        this.setAnimation(animation, speed, count, onEndCount);
    }

    public follow(entity: Entity): void {
        this.following = true;

        this.setTarget(entity);
        this.move(entity.gridX, entity.gridY);
    }

    public followPosition(x: number, y: number): void {
        this.following = true;

        this.move(x, y);
    }

    // attack(attacker: Entity, character: Character): void {
    //     this.attacking = true;

    //     this.follow(character);
    // }

    // backOff(): void {
    //     // this.attacking = false;
    //     this.following = false;

    //     this.removeTarget();
    // }

    public addAttacker(character: Character): void {
        if (this.hasAttacker(character)) return;

        this.attackers[character.instance] = character;
    }

    // removeAttacker(character: Character): void {
    //     if (this.hasAttacker(character)) delete this.attackers[character.id];
    // }

    private hasAttacker(character: Character): boolean {
        const { attackers } = this;

        if (!attackers[0]) return false;

        return character.instance in attackers;
    }

    public performAction(orientation: Modules.Orientation, action: Modules.Actions): void {
        this.setOrientation(orientation);

        switch (action) {
            case Modules.Actions.Idle:
                this.animate('idle', this.idleSpeed);
                break;

            case Modules.Actions.Orientate:
                this.animate('idle', this.idleSpeed);
                break;

            case Modules.Actions.Attack:
                this.animate('atk', this.attackAnimationSpeed, 1);
                break;

            case Modules.Actions.Walk:
                this.animate('walk', this.walkAnimationSpeed);
                break;
        }
    }

    public idle(o?: Modules.Orientation): void {
        const orientation = o || this.orientation;

        this.performAction(orientation, Modules.Actions.Idle);
    }

    private orientationToString(o: Modules.Orientation) {
        switch (o) {
            case Modules.Orientation.Left:
                return 'left';

            case Modules.Orientation.Right:
                return 'right';

            case Modules.Orientation.Up:
                return 'up';

            case Modules.Orientation.Down:
                return 'down';
        }
    }

    public lookAt(character: Entity): void {
        const { gridX, gridY } = this;

        if (character.gridX > gridX) this.setOrientation(Modules.Orientation.Right);
        else if (character.gridX < gridX) this.setOrientation(Modules.Orientation.Left);
        else if (character.gridY > gridY) this.setOrientation(Modules.Orientation.Down);
        else if (character.gridY < gridY) this.setOrientation(Modules.Orientation.Up);

        this.idle();
    }

    public go(x: number, y: number, forced?: boolean): void {
        if (this.frozen) return;

        if (this.following) {
            this.following = false;
            this.target = null;
        }

        this.move(x, y, forced);
    }

    private proceed(x: number, y: number): void {
        this.newDestination = {
            x,
            y
        };
    }

    /**
     * We can have the movement remain client sided because
     * the server side will be responsible for determining
     * whether or not the player should have reached the
     * location and ban all hackers. That and the fact
     * the movement speed is constantly updated to avoid
     * hacks previously present in BQ.
     */
    public nextStep(): void {
        let stop = false;
        let x: number;
        let y: number;
        let path: number[][] | null;

        if (this.step % 2 === 0 && this.secondStepCallback) this.secondStepCallback();

        // this.prevGridX = this.gridX;
        // this.prevGridY = this.gridY;

        if (!this.hasPath()) return;

        this.beforeStepCallback?.();

        this.updateGridPosition();

        if (!this.interrupted && this.path) {
            if (this.hasNextStep()) [this.nextGridX, this.nextGridY] = this.path[this.step + 1];

            this.stepCallback?.();

            if (this.changedPath()) {
                ({ x, y } = this.newDestination!);

                path = this.requestPathfinding(x, y);

                if (!path) return;

                this.newDestination = null;

                if (path.length < 2) stop = true;
                else this.followPath(path);
            } else if (this.hasNextStep()) {
                this.step++;
                this.updateMovement();
            } else stop = true;
        } else {
            stop = true;
            this.interrupted = false;
        }

        if (stop) {
            this.path = null;
            this.idle();

            if (this.stopPathingCallback)
                this.stopPathingCallback(this.gridX, this.gridY, this.forced);

            this.forced &&= false;
        }
    }

    private updateMovement(): void {
        const { path, step } = this;

        if (!path) return;

        if (path[step][0] < path[step - 1][0])
            this.performAction(Modules.Orientation.Left, Modules.Actions.Walk);

        if (path[step][0] > path[step - 1][0])
            this.performAction(Modules.Orientation.Right, Modules.Actions.Walk);

        if (path[step][1] < path[step - 1][1])
            this.performAction(Modules.Orientation.Up, Modules.Actions.Walk);

        if (path[step][1] > path[step - 1][1])
            this.performAction(Modules.Orientation.Down, Modules.Actions.Walk);
    }

    private followPath(path: number[][] | null): void {
        /**
         * This is to ensure the player does not click on
         * himthis or somehow into another dimension
         */

        if (!path || path.length < 2) return;

        this.path = path;
        this.step = 0;

        if (this.following) path.pop();

        this.startPathingCallback?.(path);

        this.nextStep();
    }

    private move(x: number, y: number, forced?: boolean): void {
        // this.destination = {
        //     gridX: x,
        //     gridY: y
        // };

        // this.adjacentTiles = {};

        if (this.hasPath() && !forced) this.proceed(x, y);
        else this.followPath(this.requestPathfinding(x, y));
    }

    public stop(force?: boolean): void {
        if (!force) this.interrupted = true;
        else if (this.hasPath()) {
            this.path = null;
            this.newDestination = null;
            this.movement = new Transition();
            this.performAction(this.orientation, Modules.Actions.Idle);
            this.nextGridX = this.gridX;
            this.nextGridY = this.gridY;
        }
    }

    public hasEffect(): boolean {
        return this.critical || this.stunned || this.terror || this.explosion || this.healing;
    }

    public getEffectAnimation(): Animation | undefined {
        if (this.critical) return this.criticalAnimation;

        if (this.stunned) return this.stunAnimation;

        if (this.terror) return this.terrorAnimation;

        if (this.explosion) return this.explosionAnimation;

        if (this.healing) return this.healingAnimation;
    }

    public getActiveEffect():
        | 'criticaleffect'
        | 'stuneffect'
        | 'explosion-terror'
        | 'explosion-fireball'
        | 'explosion-heal'
        | undefined {
        if (this.critical) return 'criticaleffect';

        if (this.stunned) return 'stuneffect';

        if (this.terror) return 'explosion-terror';

        if (this.explosion) return 'explosion-fireball';

        if (this.healing) return 'explosion-heal';
    }

    /**
     * TRIGGERED!!!!
     */
    public triggerHealthBar(): void {
        this.healthBarVisible = true;

        if (this.healthBarTimeout) clearTimeout(this.healthBarTimeout);

        this.healthBarTimeout = window.setTimeout(() => {
            this.healthBarVisible = false;
        }, 7000);
    }

    public clearHealthBar(): void {
        this.healthBarVisible = false;
        clearTimeout(this.healthBarTimeout!);
        this.healthBarTimeout = null;
    }

    private requestPathfinding(x: number, y: number): number[][] | null {
        return this.requestPathCallback?.(x, y) || null;
    }

    private updateGridPosition(): void {
        if (!this.path || this.path.length === 0) return;

        this.setGridPosition(this.path[this.step][0], this.path[this.step][1]);
    }

    // isMoving(): boolean {
    //     return this.currentAnimation.name === 'walk' || this.x % 2 !== 0 || this.y % 2 !== 0;
    // }

    public forEachAttacker(callback: (attacker: Character) => void): void {
        _.each(this.attackers, (attacker) => callback(attacker));
    }

    // isAttacked(): boolean {
    //     return Object.keys(this.attackers).length > 0;
    // }

    public hasWeapon(): boolean {
        return false;
    }

    public hasShadow(): boolean {
        return true;
    }

    public hasPath(): boolean {
        return this.path !== null;
    }

    public hasNextStep(): boolean | null {
        return this.path && this.path.length - 1 > this.step;
    }

    private changedPath(): boolean {
        return !!this.newDestination;
    }

    public removeTarget(): void {
        if (!this.target) return;

        this.target = null;
    }

    public forget(): void {
        this.attackers = {};
    }

    public moved(): void {
        // this.loadDirty();

        this.moveCallback?.();
    }

    public setTarget(target: Entity): void {
        if (!target) {
            this.removeTarget();
            return;
        }

        if (this.target) {
            if (this.target.id === target.id) return;

            this.removeTarget();
        }

        this.target = target;
    }

    public setObjectTarget(x: number, y: number): void {
        /**
         * All we are doing is mimicking the `setTarget` entity
         * parameter. But we are throwing in an extra.
         */

        const character = new Character(`${x}-${y}`, 'object');
        character.setGridPosition(x, y);

        this.setTarget(character);
    }

    public setHitPoints(hitPoints: number): void {
        if (hitPoints < 0) hitPoints = 0;

        this.hitPoints = hitPoints;

        this.hitPointsCallback?.(this.hitPoints);
    }

    public setMaxHitPoints(maxHitPoints: number): void {
        this.maxHitPoints = maxHitPoints;

        this.maxHitPointsCallback?.(this.maxHitPoints);
    }

    public setOrientation(orientation: Modules.Orientation): void {
        this.orientation = orientation;
    }

    public onRequestPath(callback: (x: number, y: number) => number[][] | null): void {
        this.requestPathCallback = callback;
    }

    public onStartPathing(callback: (path: number[][]) => void): void {
        this.startPathingCallback = callback;
    }

    public onStopPathing(callback: (gridX: number, gridY: number) => void): void {
        this.stopPathingCallback = callback;
    }

    public onBeforeStep(callback: () => void): void {
        this.beforeStepCallback = callback;
    }

    public onStep(callback: () => void): void {
        this.stepCallback = callback;
    }

    public onSecondStep(callback: () => void): void {
        this.secondStepCallback = callback;
    }

    public onMove(callback: () => void): void {
        this.moveCallback = callback;
    }

    public onHitPoints(callback: () => void): void {
        this.hitPointsCallback = callback;
    }

    public onMaxHitPoints(callback: () => void): void {
        this.maxHitPointsCallback = callback;
    }
}
