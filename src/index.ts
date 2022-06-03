import { Engine, Render, Bodies, Body, Composite, Runner, Events, Vector } from 'matter-js'

const canvas = document.getElementById('canvas') as HTMLCanvasElement | undefined
const uniform = (a: number, b: number): number => a + Math.random() * (b - a)
const G = 1

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

const composites: Body[] = []
const dynamics: Body[] = []
const statics: Body[] = []

function makeBody ({ x, y, radius, color }: {
  x: number
  y: number
  radius: number
  color: string
}): Body {
  const body = Bodies.circle(x, y, radius)
  body.render.fillStyle = color
  composites.push(body)

  return body
}

function makeStatic ({ x, y, radius, color = 'red' }: {
  x: number
  y: number
  radius: number
  color: string
}): Body {
  const body = makeBody({ x, y, radius, color })
  body.isStatic = true
  statics.push(body)
  return body
}

function makeDynamic ({ x, y, width, height, color = 'blue' }: {
  x: number
  y: number
  width: number
  height: number
  color: string
}): Body {
  const body = Bodies.rectangle(x, y, width, height)
  body.render.fillStyle = color
  body.isStatic = false
  composites.push(body)
  dynamics.push(body)
  return body
}

// create bodies
// sun
makeStatic({ x: 500, y: 300, radius: 50, color: 'red' })
// planet
makeStatic({ x: -500, y: -300, radius: 20, color: 'green' })
const ship = makeDynamic({ x: -20, y: 0, width: 10, height: 10, color: 'blue' })
const initialVelolcity = { x: uniform(-4, 4), y: uniform(-4, 4) }
Body.setVelocity(ship, initialVelolcity)

// meteor
makeDynamic({ x: 0, y: 0, width: 10, height: 10, color: 'black' })

// add all of the bodies to the world
Composite.add(engine.world, composites)

// run the renderer
Render.run(render)

// create runner
const runner = Runner.create()

// run the engine
Runner.run(runner, engine)

Events.on(engine, 'afterUpdate', e => {
  dynamics.forEach(d => {
    statics.forEach(s => {
      const arrow = Vector.sub(s.position, d.position)
      const direction = Vector.normalise(arrow)
      const dist = Vector.magnitude(arrow)
      const force = Vector.mult(Vector.div(direction, dist * dist), G * s.mass * d.mass)
      Body.applyForce(d, d.position, force)
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
