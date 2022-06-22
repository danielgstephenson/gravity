import Matter, { Engine, Render, Bodies, Body, Composite, Runner, Events, Vector } from 'matter-js'

const canvas = document.getElementById('canvas') as HTMLCanvasElement | undefined

/* TO DO
Use map instead of dictionaries or arrays
Use generics to allow action functions to take different types
Don't use Composite.allBodies anywhere
*/

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

type Action = (actor: Actor) => void

interface Actor {
  composite: Composite
  body: Body
  action?: Action
}

interface Fighter extends Actor {
  ship?: Ship
}

interface Ship extends Actor {
  fighter?: Fighter
}

interface Tower extends Actor {
  planet: Planet
  charging: boolean
  firing: boolean
}

interface Planet extends Actor {
  towers: Tower[]
}

const composites: Composite[] = []
const dynamics = new Map<number, Body>()
const statics = new Map<number, Body>()
const fighters = new Map<number, Fighter>()
const ships = new Map<number, Ship>()
const planets = new Map<number, Planet>()
const towers = new Map<number, Tower>()
const actors = new Map<number, Actor>()

function makeActor ({ body, bodies, action, label }: {
  body: Body
  bodies?: Body[]
  action?: Action
  label?: string
}): Actor {
  const array = bodies == null ? [body] : bodies
  const composite = Composite.create({ bodies: array })
  if (label != null) {
    composite.label = label
    body.label = label
    array.forEach(body => { body.label = label })
  }
  composites.push(composite)
  const actor: Actor = { composite, body, action }
  actors.set(body.id, actor)
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
  body.render.fillStyle = color
  dynamics.set(body.id, body)
  return makeActor({ body, action, label })
}

function makeFighter (props: {
  x: number
  y: number
  width: number
  height: number
  color: string
  action?: Action
}): Fighter {
  const actor: Fighter = makeDynamic({ ...props, label: 'fighter' })
  actor.action = (actor: Actor): void => {
    const dist = (a: Actor): number => Vector.magnitude(Vector.sub(a.body.position, actor.body.position))
    const ship = [...ships.values()].reduce((a, b) => dist(a) < dist(b) ? a : b)
    const direction = Vector.normalise(Vector.sub(ship.body.position, actor.body.position))
    const force = Vector.mult(direction, actor.body.mass * 0.02 * state.dt)
    Body.applyForce(actor.body, actor.body.position, force)
  }
  fighters.set(actor.body.id, actor)
  return actor
}

function makeShip (props: {
  x: number
  y: number
  width: number
  height: number
  color: string
  action?: Action
}): Ship {
  const actor: Ship = makeDynamic({ ...props, label: 'ship' })
  actor.action = (actor: Actor): void => {
    const dist = (a: Actor): number => Vector.magnitude(Vector.sub(a.body.position, actor.body.position))
    const forces = [...fighters.values()].map(fighter => {
      const direction = Vector.normalise(Vector.sub(actor.body.position, fighter.body.position))
      return Vector.div(direction, dist(fighter))
    })
    const sumForces = forces.reduce((a, b) => Vector.add(a, b), { x: 0, y: 0 })
    const direction = Vector.normalise(sumForces)
    const toCenter = Vector.normalise(Vector.neg(actor.body.position))
    const direction2 = Vector.add(Vector.mult(direction, 0.5), Vector.mult(toCenter, 0.5))
    const force = Vector.mult(direction2, actor.body.mass * 0.02 * state.dt)
    Body.applyForce(actor.body, actor.body.position, force)
  }
  ships.set(actor.body.id, actor)
  return actor
}

function makePlanet ({ x, y, radius, color }: {
  x: number
  y: number
  radius: number
  color: string
}): Planet {
  const body = Bodies.circle(x, y, radius)
  body.isStatic = true
  body.render.fillStyle = color
  statics.set(body.id, body)
  const actor = makeActor({ body, label: 'planet' })
  actor.action = () => {
    Composite.rotate(actor.composite, 0.01, actor.body.position)
  }
  const planet = { ...actor, towers: [] }
  planets.set(body.id, planet)
  return planet
}

function makeTower ({ planet }: {
  planet: Planet
}): Tower {
  if (planet.body.circleRadius != null) {
    const x = planet.body.position.x
    const y = planet.body.position.y
    const body = Bodies.rectangle(x + planet.body.circleRadius, y, 20, 10)
    body.isStatic = true
    body.isSensor = true
    body.render.fillStyle = 'rgba(100,100,100,0.5)'
    const actor = makeActor({ body, label: 'tower' }) as Tower
    actor.action = (actor: Actor) => {
      const tower = actor as Tower
      const bodies = Composite.allBodies(engine.world)
      const start = { x: tower.body.position.x, y: tower.body.position.y }
      const end = {
        x: start.x + Math.cos(tower.planet.body.angle) * 1000,
        y: start.y + Math.sin(tower.planet.body.angle) * 1000
      }
      const collisions = Matter.Query.ray(bodies, start, end, 5)
      const labels = collisions.map(x => x.bodyA.label)
      if (labels.includes('fighter') && !tower.charging && !tower.firing) {
        tower.firing = true
        tower.charging = false
        setTimeout(() => {
          tower.firing = false
          tower.charging = true
          setTimeout(() => {
            tower.firing = false
            tower.charging = false
          }, 4000)
        }, 4000)
      }
      collisions.map(x => x.bodyA).forEach(body => {
        if (!tower.charging && body.label === 'fighter') {
          const composite = fighters.get(body.id)?.composite
          actors.delete(body.id)
          fighters.delete(body.id)
          if (composite != null) Matter.Composite.remove(engine.world, composite)
        }
      })
    }
    actor.planet = planet
    actor.firing = false
    actor.charging = false
    Composite.add(planet.composite, actor.body)
    towers.set(body.id, actor)
    return actor
  }
  throw new Error('planet.body.circleRadius is undefined')
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
  return makeActor({ body, action, label: 'wall' })
}

// create bodies

// sun

// planet2
makePlanet({ x: -400, y: -200, radius: 20, color: 'green' })
const sun = makePlanet({ x: 400, y: 300, radius: 50, color: 'yellow' })
makePlanet({ x: 400, y: 0, radius: 10, color: 'grey' })
makeTower({ planet: sun })

// ship
makeShip({ x: -20, y: 0, width: 10, height: 10, color: 'blue' })
makeShip({ x: 0, y: 0, width: 10, height: 10, color: 'blue' })

// fighter
makeFighter({ x: -100, y: 10, width: 10, height: 10, color: 'red' })
makeFighter({ x: -100, y: -300, width: 10, height: 10, color: 'red' })

// meteor
// makeDynamic({ x: 0, y: 0, width: 10, height: 10, color: 'black' })

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
  const G = 10
  actors.forEach(actor => {
    actor.action?.(actor)
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
  ships.forEach(ship => {
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
    orderings.forEach(ordering => {
      const labels = ordering.map(body => body.label)
      if (labels[0] === 'ship' && labels[1] === 'fighter') {
        const ship = ships.get(ordering[0].id)
        const fighter = fighters.get(ordering[1].id)
        if (ship != null) ship.fighter = fighter
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

window.onmousedown = (e: MouseEvent) => {
  console.log(`mousePos = (${e.x},${e.y})`)
}

Events.on(render, 'afterRender', e => {
  towers.forEach(tower => {
    render.context.strokeStyle = tower.charging ? 'blue' : tower.firing ? 'red' : 'green'
    render.context.lineWidth = 1
    render.context.beginPath()
    const start = { x: tower.body.position.x, y: tower.body.position.y }
    const end = {
      x: start.x + Math.cos(tower.planet.body.angle) * 1000,
      y: start.y + Math.sin(tower.planet.body.angle) * 1000
    }
    render.context.moveTo(start.x, start.y)
    render.context.lineTo(end.x, end.y)
    render.context.stroke()
  })
})
