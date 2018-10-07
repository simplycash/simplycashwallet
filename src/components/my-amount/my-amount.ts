import { Component, ElementRef, ViewChild, Input, Output, EventEmitter, AfterViewInit, OnDestroy } from '@angular/core'
import { Wallet } from '../../providers/providers'

@Component({
  selector: 'my-amount',
  templateUrl: 'my-amount.html'
})
export class MyAmountComponent {
  @Input() label: string
  @Input() placeholder: string
  @Output() satoshisChange = new EventEmitter()
  @ViewChild('amount') amountEl
  @ViewChild('amount', { read: ElementRef }) amountElNative

  private inputEl: any
  private currentUnit: string
  private amountSATOSHIS: string
  private touch: boolean = false
  private inputTouch: boolean = false
  private blurTimer: number
  private justBlurred: boolean = false

  private preferredSmallUnitCallback: Function
  private preferredCurrencyCallback: Function

  constructor(private wallet: Wallet) {
    this.currentUnit = this.wallet.getUnits()[0]
    this.preferredSmallUnitCallback = (sym: string) => {
      if (this.wallet.getUnits().indexOf(this.currentUnit) === -1) {
        this.changeUnit(sym)
      }
    }
    this.preferredCurrencyCallback = (sym: string) => {
      if (this.wallet.getUnits().indexOf(this.currentUnit) === -1) {
        this.changeUnit(sym)
      }
    }
  }

  ngAfterViewInit() {
    this.inputEl = this.amountElNative.nativeElement.querySelector('input')
    this.wallet.subscribePreferredSmallUnit(this.preferredSmallUnitCallback)
    this.wallet.subscribePreferredCurrency(this.preferredCurrencyCallback)
  }

  ngOnDestroy() {
    this.wallet.unsubscribePreferredSmallUnit(this.preferredSmallUnitCallback)
    this.wallet.unsubscribePreferredCurrency(this.preferredCurrencyCallback)
  }

  amountInput(ev: any) {
    if (this.inputTouch) {
      this.inputTouch = false
      return
    }
    this.inputTouch = true
    if (this.amountEl.value.length !== 0) {
      return
    }
    if (this.inputEl.checkValidity()) {
      this.amountSATOSHIS = undefined
      this.satoshisChange.emit(undefined)
    } else {
      this.amountSATOSHIS = '0'
      this.satoshisChange.emit(0)
    }
  }

  amountChange(ev: any) {
    if (this.touch) {
      this.touch = false
      return
    }
    if (this.amountEl.value.length === 0 && this.inputEl.checkValidity()) {
      this.amountSATOSHIS = undefined
      this.satoshisChange.emit(undefined)
      return
    }
    this.amountSATOSHIS = this.wallet.convertUnit(this.currentUnit, 'SATOSHIS', this.amountEl.value) || '0'
    this.satoshisChange.emit(parseFloat(this.amountSATOSHIS))
  }

  changeUnit(unit?: string) {
    let units: string[] = this.wallet.getUnits()
    if (unit) {
      if (units.indexOf(unit) === -1) {
        return
      }
      this.currentUnit = unit
    } else {
      let i: number = units.indexOf(this.currentUnit) // can be -1
      i = (i + 1) % units.length
      this.currentUnit = units[i]
    }
    let newValue: string
    if (typeof this.amountSATOSHIS === 'undefined') {
      newValue = ''
    } else {
      newValue = this.wallet.convertUnit('SATOSHIS', this.currentUnit, this.amountSATOSHIS) || '0'
      if (this.currentUnit === 'BCH') {
        newValue = newValue.replace(/\.?0+$/,'')
      }
    }
    if (this.amountEl.value !== newValue) {
      this.touch = true
      this.amountEl.value = newValue
    }
    if (this.justBlurred) {
      this.amountEl.setFocus()
    }
  }

  getSatoshis() {
    if (typeof this.amountSATOSHIS === 'undefined') {
      return undefined
    }
    return parseFloat(this.amountSATOSHIS)
  }

  setSatoshis(sat: number) {
    this.amountSATOSHIS = sat.toString()
    this.touch = true
    this.amountEl.value = this.wallet.convertUnit('SATOSHIS', this.currentUnit, this.amountSATOSHIS)
  }

  setFocus() {
    this.amountEl.setFocus()
  }

  setBlurTimer() {
    window.clearTimeout(this.blurTimer)
    this.justBlurred = true
    this.blurTimer = window.setTimeout(() => {
      this.justBlurred = false
    }, 100)
  }

  clear() {
    this.amountEl.value = ''
  }

}
