import net from 'net'
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
        id: 'port',
        label: 'Port',
        required: true,
        regex: REGEX.PORT,
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
      }
    ],
    defaults: [null, 5000, 254],
    constructor: DeviceProviderRossNKIPS
  }

  levels = [
    { id: '1', label: 'MD Video' },
    { id: '2', label: 'SDI Video' },
    { id: '4', label: 'AES Audio 1' },
    { id: '8', label: 'AES Audio 2' },
    { id: '16', label: 'Analog Video' },
    { id: '32', label: 'Analog Audio 1' },
    { id: '64', label: 'Analog Audio 2' },
    { id: '128', label: 'Machine Control' }
  ]

  providerFunctions = [
    {
      id: 'XPT',
      label: 'Direct Crosspoint',
      parameters: [
        {
          inputType: 'comboBox',
          id: 'level',
          label: 'Level',
          required: true,
          items: this.levels,
          placeholder: 'Signal Level'
        },
        {
          inputType: 'numberInput',
          id: 'dst',
          label: 'Destination',
          required: true,
          placeholder: 'Destination',
          invalidText: 'Invalid Destination',
          min: 1,
          max: this.device?.configuration.destinations
        },
        {
          inputType: 'numberInput',
          id: 'src',
          label: 'Source',
          required: true,
          placeholder: 'Source',
          invalidText: 'Invalid Source',
          min: 1,
          max: this.device?.configuration.sources
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
          items: this.levels,
          placeholder: 'Signal Level'
        }
      ]
    },
    {
      id: 'DST_MSX',
      label: 'Destination Select (MultiStage Crosspoint)',
      parameters: [
        {
          inputType: 'numberInput',
          id: 'dst',
          label: 'Destination',
          required: true,
          placeholder: 'Destination',
          invalidText: 'Invalid Destination',
          min: 1,
          max: this.device?.configuration.destinations
        }
      ]
    },
    {
      id: 'SRC_MSX',
      label: 'Source Select (MultiStage Crosspoint)',
      parameters: [
        {
          inputType: 'numberInput',
          id: 'src',
          label: 'Source',
          required: true,
          placeholder: 'Source',
          invalidText: 'Invalid Source',
          min: 1,
          max: this.device?.configuration.sources
        }
      ]
    },
    {
      id: 'TAKE_MSX',
      label: 'Take (MultiStage Crosspoint)'
    }
  ]

  keepaliveInterval

  init = () => {
    this.socket = net.createConnection(this.device.configuration.port, this.device.configuration.host)
    this.socket.setKeepAlive(true, 0)

    this.socket.on('connect', () => {
      log('info', `virtual/device/${this.device.id} (${this.device.label})`, 'Socket Connected')
      devices.updateOne({ id: this.device.id }, { $set: { status: STATUS.OK } })
      this.socket.write(Buffer.from('50484f454e49582d4442204e0a', 'hex'))
      
    })
    
    this.keepaliveInterval = setInterval(() => {
      this.socket.write(Buffer.from('4849', 'hex'))
    }, 10000)

    this.socket.on('error', (error) => {
      log('error', `virtual/device/${this.device.id} (${this.device.label})`, `${error}`)
      devices.updateOne({ id: this.device.id }, { $set: { status: STATUS.ERROR } })
    })

    this.socket.on('close', () => {
      devices.updateOne({ id: this.device.id }, { $set: { status: STATUS.CLOSED } })
      switch (this.doNotRecreate) {
        case true:
          break
        case false:
          log('error', `virtual/device/${this.device.id} (${this.device.label})`, 'Socket Closed, Reconnecting in 10 Seconds')
          clearTimeout(this.keepaliveInterval)
          setTimeout(() => this.recreate(), 10000)
      }
    })
  }

  destroy = (callback) => {
    log('info', `virtual/device/${this.device.id} (${this.device.label})`, 'Destroying Instance')
    this.doNotRecreate = true
    if (this.socket) {
      this.socket.destroy()
    }
    clearTimeout(this.keepaliveTimeout)
    if (typeof callback === 'function') {
      callback()
    }
  }

  recreate = () => {
    this.destroy()
    this.init()
  }

  crc16 = buffer => {
    let crc = 0xFFFF
    let odd

    for (let i = 0; i < buffer.length; i++) {
      crc = crc ^ buffer[i]
    
      for (let j = 0; j < 8; j++) {
        odd = crc & 0x0001
        crc = crc >> 1
        if (odd) {
          crc = crc ^ 0xA001
        }
      }
    }

    crc = ((crc & 0xFF) << 8) | ((crc & 0xFF00) >> 8)
    return crc
  }

  decimalToHex = (decimal) => {
    return Number(decimal).toString(16)
  }

  padHex = (data, pad) => {
    while (data.length < pad) {
      data = '0' + data
    }
    return data
  }

  xpt = ({ level, destination, source }) => {
    let string 
      = '4e4b3200' 
      + this.padHex(this.decimalToHex(this.device.configuration.address), 2)
      + '0409'
      + this.padHex(this.decimalToHex(destination - 1), 4)
      + this.padHex(this.decimalToHex(source - 1), 4)
      + this.padHex(this.decimalToHex(level), 8)
      + '00'
    const crc = this.crc16(Buffer.from(string, 'hex')).toString(16)
    string = '504153320012' + string + crc
    const buffer = Buffer.from(string, 'hex')
    this.socket.write(buffer)
  }

  multistageDataStore = {}

  interface = (_action) => {
    switch (_action.providerFunction.id) {
      case 'XPT': // XPT
        this.xpt({ destination: _action.parameters.dst, source: _action.parameters.src, level: _action.parameters.level.id })
        break
      
      // MULTISTAGE CROSSPOINT
      case 'LVL_MSX': // Multistage Crosspoint Level Select
        this.multistageDataStore[_action.controller] = { ...this.multistageDataStore[_action.controller], level: _action.parameters.level.id }
        break
      case 'DST_MSX': // Multistage Crosspoint Destination Select
        this.multistageDataStore[_action.controller] = { ...this.multistageDataStore[_action.controller], dst: _action.parameters.dst }
        break
      case 'SRC_MSX': // Multistage Crosspoint Source Select
        this.multistageDataStore[_action.controller] = { ...this.multistageDataStore[_action.controller], src: _action.parameters.src }
        break
      case 'TAKE_MSX': // Multistage Crosspoint Take
        console.log(this.multistageDataStore)
        if (this.multistageDataStore[_action.controller]?.level) { // Check if level
          if (this.multistageDataStore[_action.controller]?.dst) { // Check if destination
            if (this.multistageDataStore[_action.controller]?.src) { // Check if source
              this.xpt({ destination: this.multistageDataStore[_action.controller].dst, source: this.multistageDataStore[_action.controller].src, level: this.multistageDataStore[_action.controller].level })
            } else log('warn', `virtual/device/${this.device.id} (${this.device.label})`, 'No Source Selected')
          } else log('warn', `virtual/device/${this.device.id} (${this.device.label})`, 'No Destination Selected')
        } else log('warn', `virtual/device/${this.device.id} (${this.device.label})`, 'No Level Selected')
        break
    }
  }
}

export default DeviceProviderRossNKIPS
