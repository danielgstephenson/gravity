import { Engine, Render, Bodies, Body, Composite, Runner, Events, Vector } from 'matter-js'

const canvas = document.getElementById('canvas') as HTMLCanvasElement | undefined
const uniform = (a: number, b: number): number => a + Math.random() * (b - a)
const getRandDir = (): Vector => {
  const angle = uniform(0, 2 * Math.PI)
  return { x: Math.cos(angle), y: Math.sin(angle) }
}

// create a state
interface State {
  dt: number
  run: boolean
}
const state: State = {
  dt: 0,
  run: false
}
// create an engine
const engine = Engine.create()
engine.gravity.y = 0
// create a renderer
const render = Render.create({
  engine: engine,
  canvas: canvas
})
render.options.wireframes = false
render.options.background = 'white'

type Action = (body: Body) => void

interface Actor {
  body: Body
  action?: Action
}

interface Fighter extends Actor {
  ship?: Ship
}

interface Ship extends Actor {
  fighter?: Actor
}

const composites: Body[] = []
const dynamics: Body[] = []
const statics: Body[] = []
const fighters: Record<string, Fighter> = {}
const ships: Record<string, Ship> = {}
const actors: Record<string, Actor> = {}

function makeActor ({ body, action, color = 'grey', label }: {
  body: Body
  action?: Action
  color?: string
  label?: string
}): Actor {
  body.render.fillStyle = color
  if (label != null) body.label = label
  composites.push(body)
  const actor: Actor = { body, action }
  actors[body.id] = actor
  return actor
}

function makeStatic ({ x, y, radius, color = 'red', label, action }: {
  x: number
  y: number
  radius: number
  color: string
  action?: Action
  label?: string
}): Actor {
  const body = Bodies.circle(x, y, radius)
  body.isStatic = true
  statics.push(body)
  return makeActor({ body, action, color, label })
}

function makeFighter (props: {
  x: number
  y: number
  width: number
  height: number
  color: string
  action?: Action
  label?: string
}): Actor {
  const chase = (body: Body): void => {
    const dist = (a: Actor): number => Vector.magnitude(Vector.sub(a.body.position, body.position))
    const ship = Object.values(ships).reduce((a, b) => dist(a) < dist(b) ? a : b)
    const direction = Vector.normalise(Vector.sub(ship.body.position, body.position))
    const force = Vector.mult(direction, body.mass * 0.01 * state.dt)
    Body.applyForce(body, body.position, force)
  }
  const actor = makeDynamic({ ...props, action: chase })
  fighters[actor.body.id] = actor
  return actor
}

function makeShip (props: {
  x: number
  y: number
  width: number
  height: number
  color: string
  action?: Action
  label?: string
}): Ship {
  const wander = (body: Body): void => {
    if (uniform(0, 1) < state.dt) {
      const direction = getRandDir()
      const force = Vector.mult(direction, 0.001)
      Body.applyForce(body, body.position, force)
    }
  }
  const actor = makeDynamic({ ...props, action: wander })
  ships[actor.body.id] = actor
  return actor
}

function makeDynamic ({ x, y, width, height, color = 'blue', label, action }: {
  x: number
  y: number
  width: number
  height: number
  color: string
  action?: Action
  label?: string
}): Actor {
  const body = Bodies.rectangle(x, y, width, height)
  body.isStatic = false
  body.frictionAir = 0
  const power = 0.01
  const initialVelolcity = { x: uniform(power, -power), y: uniform(power, -power) }
  Body.setVelocity(body, initialVelolcity)
  statics.push(body)
  return makeActor({ body, action, color, label })
}

function makeWall ({ x, y, width, height, color = 'purple', action }: {
  x: number
  y: number
  width: number
  height: number
  color?: string
  action?: Action
}): Actor {
  const body = Bodies.rectangle(x, y, width, height)
  body.render.fillStyle = color
  body.isStatic = true
  statics.push(body)
  return makeActor({ body, action, color })
}

// create bodies

// sun
makeStatic({ x: 400, y: 300, radius: 50, color: 'yellow' })

// planet
makeStatic({ x: -400, y: -200, radius: 20, color: 'green' })

// ship
makeShip({ x: -20, y: 0, width: 10, height: 10, color: 'blue', label: 'ship' })
makeShip({ x: 0, y: 0, width: 10, height: 10, color: 'blue', label: 'ship' })

// fighter
makeFighter({ x: -100, y: 10, width: 10, height: 10, color: 'red', label: 'fighter' })
makeFighter({ x: -100, y: -300, width: 10, height: 10, color: 'red', label: 'fighter' })

// meteor
makeDynamic({ x: 0, y: 20, width: 10, height: 10, color: 'black' })

// walls
makeWall({ x: 850, y: 0, width: 100, height: 2000 })
makeWall({ x: -850, y: 0, width: 100, height: 2000 })
makeWall({ x: 0, y: -500, width: 2000, height: 100 })
makeWall({ x: 0, y: 500, width: 2000, height: 100 })

// add all of the bodies to the world
Composite.add(engine.world, composites)

// run the renderer
Render.run(render)

// create runner
const runner = Runner.create()

// run the engine
Runner.run(runner, engine)

Events.on(engine, 'afterUpdate', e => {
  state.dt = engine.timing.lastDelta / 1000
  const G = 50
  Object.values(actors).forEach(actor => {
    actor.action?.(actor.body)
  })
  dynamics.forEach(d => {
    statics.forEach(s => {
      const arrow = Vector.sub(s.position, d.position)
      const direction = Vector.normalise(arrow)
      const dist = Vector.magnitude(arrow)
      const force = Vector.mult(Vector.div(direction, dist * dist), state.dt * G * s.mass * d.mass)
      Body.applyForce(d, d.position, force)
    })
  })
  Object.values(ships).forEach(ship => {
    if (ship.fighter != null) {
      const direction = Vector.normalise(Vector.sub(ship.body.position, ship.fighter.body.position))
      const force = Vector.mult(direction, 0.004)
      Body.applyForce(ship.body, ship.body.position, force)
      state.run = false
      ship.fighter = undefined
    }
  })
})

Events.on(engine, 'collisionStart', e => {
  e.pairs.forEach(pair => {
    const orderings = [
      [pair.bodyA, pair.bodyB],
      [pair.bodyB, pair.bodyA]
    ]
    orderings.forEach(bodies => {
      const labels = bodies.map(body => body.label)
      if (labels[0] === 'ship' && labels[1] === 'fighter') {
        console.log('collide')
        const ship = ships[bodies[0].id]
        const fighter = fighters[bodies[1].id]
        ship.fighter = fighter
      }
    })
  })
})

Events.on(render, 'beforeRender', e => {
  render.bounds.max.x = 800
  render.bounds.min.x = -800
  render.bounds.max.y = 450
  render.bounds.min.y = -450
  // @ts-expect-error
  Render.startViewTransform(render)
})
