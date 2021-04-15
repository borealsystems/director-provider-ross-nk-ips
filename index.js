const NKIPS = require('nkips')
import { devices } from '../../../db'
import log from '../../../utils/log'
import STATUS from '../../../utils/statusEnum'
import REGEX from '../../../utils/regexEnum'

class DeviceProviderRossNKIPS {
  constructor (_device) {
    this.device = _device
  }

  static providerRegistration = {
    id: 'DeviceProviderRossNKIPS',
    label: 'Carbonite NK-IPS',
    manufacturer: 'Ross Video',
    protocol: 'T-Bus Over TCP',
    description: 'The NK Series routing family is a cost effective, high performance routing platform for Studios, OB Vans, and Flypacks.',
    category: 'Hybrid Router',
    parameters: [
      {
        inputType: 'textInput',
        id: 'host',
        label: 'Host',
        required: true,
        regex: REGEX.HOST,
        placeholder: 'Device Host'
      },
      {
        inputType: 'numberInput',
        id: 'address',
        label: 'TBus Address',
        required: true,
        min: 1,
        max: 255,
        tooltip: 'This is the T-Bus address of the NK-IPS, not the router behind'
      },
      {
        inputType: 'numberInput',
        id: 'sources',
        label: 'Sources',
        required: true,
        min: 16,
        max: 144
      },
      {
        inputType: 'numberInput',
        id: 'destinations',
        label: 'Destinations',
        required: true,
        min: 16,
        max: 144
      },
      {
        inputType: 'textAreaInput',
        id: 'labels',
        label: 'Labels',
        required: false
      }
    ],
    defaults: [null, 254],
    constructor: DeviceProviderRossNKIPS
  }

  getLabel = (a, index) => ({ id: index, label: a.label + (a.description ? ` - ${a.description}` : '') })

  providerFunctions = () => {
    return [
      {
        id: 'XPT',
        label: 'Direct Crosspoint',
        parameters: [
          {
            inputType: 'comboBox',
            id: 'level',
            label: 'Level',
            required: true,
            items: this.router.levels,
            placeholder: 'Signal Level'
          },
          {
            inputType: 'comboBox',
            id: 'dst',
            label: 'Destination',
            required: true,
            items: this.router.labels.outputs.map((output, index) => this.getLabel(output, index)) ?? [],
            placeholder: 'Destination'
          },
          {
            inputType: 'comboBox',
            id: 'src',
            label: 'Source',
            required: true,
            items: this.router.labels.inputs.map((input, index) => this.getLabel(input, index)) ?? [],
            placeholder: 'Source'
          }
        ]
      },
      {
        id: 'LVL_MSX',
        label: 'Level Select (MultiStage Crosspoint)',
        parameters: [
          {
            inputType: 'comboBox',
            id: 'level',
            label: 'Level',
            required: true,
            items: this.router.levels,
            placeholder: 'Signal Level'
          }
        ]
      },
      {
        id: 'DST_MSX',
        label: 'Destination Select (MultiStage Crosspoint)',
        parameters: [
          {
            inputType: 'comboBox',
            id: 'dst',
            label: 'Destination',
            required: true,
            items: this.router.labels.outputs.map((output, index) => this.getLabel(output, index)) ?? [],
            placeholder: 'Destination'
          }
        ]
      },
      {
        id: 'SRC_MSX',
        label: 'Source Select (MultiStage Crosspoint)',
        parameters: [
          {
            inputType: 'comboBox',
            id: 'src',
            label: 'Source',
            required: true,
            items: this.router.labels.inputs.map((input, index) => this.getLabel(input, index)) ?? [],
            placeholder: 'Source'
          }
        ]
      },
      {
        id: 'TAKE_MSX',
        label: 'Take (MultiStage Crosspoint)'
      }
    ]
  }

  init = () => {
    this.router = new NKIPS({
      host: this.device.configuration.host,
      address: this.device.configuration.address,
      inputs: this.device.configuration.sources,
      outputs: this.device.configuration.destinations,
      levels: 8,
      labels: this.device.configuration.labels
    })

    this.router.on('ready', () => {
      log('info', `virtual/device/${this.device.id} (${this.device.label})`, 'Router Connected')
      devices.updateOne({ id: this.device.id }, { $set: { status: STATUS.OK } })
    })

    this.router.on('crosspoint', crosspoint => log('info', `virtual/device/${this.device.id} (${this.device.label})`,`CrossPoint ${crosspoint.id} (${crosspoint.label}) Updated`))
  }

  destroy = (callback) => {
    this.doNotRecreate = true
    if (this.router) {
      log('info', `virtual/device/${this.device.id} (${this.device.label})`, 'Destroying Instance')
      this.router.destroy()
      devices.updateOne({ id: this.device.id }, { $set: { status: STATUS.CLOSED } })
    }
    if (typeof callback === 'function') {
      callback()
    }
  }

  recreate = () => {
    this.destroy()
    this.init()
  }

  multistageDataStore = {}

  interface = (_action) => {
    const level = this.router.levelToInt[typeof _action.parameters.level === 'string' ? _action.parameters.level : _action.parameters.level.label]
    const dst   = typeof _action.parameters.dst === 'number' ? _action.parameters.dst : _action.parameters.dst.id
    const src   = typeof _action.parameters.src === 'number' ? _action.parameters.src : _action.parameters.src.id

    switch (_action.providerFunction.id) {
      case 'XPT': // XPT
        this.router.setCrossPoint({ level: level, destination: dst, source: src })
        break
      
      // MULTISTAGE CROSSPOINT
      case 'LVL_MSX': // Multistage Crosspoint Level Select
        this.multistageDataStore[_action.controller] = { ...this.multistageDataStore[_action.controller], level: level }
        break
      case 'DST_MSX': // Multistage Crosspoint Destination Select
        this.multistageDataStore[_action.controller] = { ...this.multistageDataStore[_action.controller], dst: dst }
        break
      case 'SRC_MSX': // Multistage Crosspoint Source Select
        this.multistageDataStore[_action.controller] = { ...this.multistageDataStore[_action.controller], src: src }
        break
      case 'TAKE_MSX': // Multistage Crosspoint Take
        if (this.multistageDataStore[_action.controller]?.level) { // Check if level
          if (this.multistageDataStore[_action.controller]?.dst) { // Check if destination
            if (this.multistageDataStore[_action.controller]?.src) { // Check if source
              this.router.setCrossPoint({ level: this.multistageDataStore[_action.controller].level, destination: this.multistageDataStore[_action.controller].dst, source: this.multistageDataStore[_action.controller].src })
            } else log('warn', `virtual/device/${this.device.id} (${this.device.label})`, 'No Source Selected')
          } else log('warn', `virtual/device/${this.device.id} (${this.device.label})`, 'No Destination Selected')
        } else log('warn', `virtual/device/${this.device.id} (${this.device.label})`, 'No Level Selected')
        break
    }
  }
}

export default DeviceProviderRossNKIPS
