import { Component, ElementRef, ViewChild, Input, Output, EventEmitter } from '@angular/core'
import { Wallet } from '../../providers/providers'

//what a mess!

@Component({
  selector: 'my-amount',
  templateUrl: 'my-amount.html'
})
export class MyAmountComponent {
  @Input() label: string
  @Input() placeholder: string
  @Input() fixedAmount: string
  @Output() satoshisChange = new EventEmitter()
  @ViewChild('amount') amountEl
  @ViewChild('amount', { read: ElementRef }) amountElNative

  public inputEl: any
  public touch: boolean = false
  public inputTouch: boolean = false

  public fromUnit: string
  public fromAmount: string

  public preferredUnitCallback: Function
  public priceCallback: Function

  public isTyping: boolean = false

  constructor(public wallet: Wallet) {
    this.preferredUnitCallback = (sym: string) => {
      this.updateInputField()
    }
    this.priceCallback = () => {
      if (this.fromUnit && this.fromAmount) {
        if (!this.isTyping) {
          this.updateInputField()
        }
        this.satoshisChange.emit(this.getSatoshis())
      }
    }
  }

  setFixedAmount(a: string) {
    if (typeof a === 'undefined') {
      this.fixedAmount = undefined
      this.fromUnit = undefined
    } else {
      this.fixedAmount = a
      this.fromUnit = 'SATS'
    }
    this.fromAmount = this.fixedAmount
    this.updateInputField()
    this.satoshisChange.emit(this.getSatoshis())
  }

  ngAfterViewInit() {
    this.inputEl = this.amountElNative.nativeElement.querySelector('input')
    this.wallet.subscribePreferredUnit(this.preferredUnitCallback)
    this.wallet.subscribePrice(this.priceCallback)
    if (parseFloat(this.fixedAmount) >= 0) {
      this.fromUnit = 'SATS'
      this.fromAmount = this.fixedAmount
      this.updateInputField()
      this.satoshisChange.emit(this.getSatoshis())
    }
  }

  ngOnDestroy() {
    this.wallet.unsubscribePreferredUnit(this.preferredUnitCallback)
    this.wallet.unsubscribePrice(this.priceCallback)
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
    this.fromUnit = this.wallet.getPreferredUnit()
    if (this.inputEl.checkValidity()) {
      this.setFromAmount(undefined)
    } else {
      this.setFromAmount(0)
    }
  }

  amountChange(ev: any) {
    if (this.touch) {
      this.touch = false
      return
    }
    this.fromUnit = this.wallet.getPreferredUnit()
    if (this.amountEl.value.length === 0 && this.inputEl.checkValidity()) {
      this.setFromAmount(undefined)
      return
    }
    this.setFromAmount(parseFloat(this.amountEl.value))
  }

  changeUnit() {
    this.wallet.changePreferredUnit()
  }

  updateInputField() {
    let unit = this.wallet.getPreferredUnit()
    let newValue: string
    if (typeof this.fromAmount === 'undefined') {
      newValue = ''
    } else {
      newValue = this.wallet.convertUnit(this.fromUnit, unit, this.fromAmount) || '0'
      if (unit === 'BSV') {
        newValue = newValue.replace(/\.?0+$/,'')
      }
    }
    if (this.amountEl.value !== newValue) {
      this.touch = true
      this.amountEl.value = newValue
    }
  }

  setFromAmount(a: number) {
    if (typeof a === 'undefined') {
      this.fromAmount = undefined
    } else if (isNaN(a)) {
      this.fromAmount = '0'
    } else {
      this.fromAmount = a.toString()
    }
    this.satoshisChange.emit(this.getSatoshis())
  }

  getSatoshis() {
    if (typeof this.fromAmount === 'undefined') {
      return undefined
    }
    return parseFloat(this.wallet.convertUnit(this.fromUnit, 'SATS', this.fromAmount)) || 0
  }

  setFocus() {
    this.amountEl.setFocus()
  }

  clear() {
    this.amountEl.value = ''
  }

}
