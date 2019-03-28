import { Component, ElementRef, NgZone, ViewChild, Input, Output, EventEmitter } from '@angular/core'
import { Platform } from 'ionic-angular'
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
  @Input() showMaxAmount: boolean
  @Output() satoshisChange = new EventEmitter()
  @ViewChild('amount') amountEl
  @ViewChild('pad', { read: ElementRef }) padElRef: ElementRef

  public fromUnit: string
  public fromAmount: string

  public preferredUnitCallback: Function
  public priceCallback: Function
  public updateCallback: Function

  public isTyping: boolean = false

  public maxAmount: string
  public unregisterBackButtonAction: Function
  public padBtns: any[]
  public windowClickListener: any

  constructor(
    public ngZone: NgZone,
    public platform: Platform,
    public wallet: Wallet
  ) {
    this.preferredUnitCallback = (sym: string) => {
      if (!this.isTyping) {
        this.updateInputField()
      }
      this.updateMaxAmount()
    }
    this.priceCallback = () => {
      if (this.fromUnit && this.fromAmount) {
        if (!this.isTyping) {
          this.updateInputField()
        }
        this.satoshisChange.emit(this.getSatoshis())
      }
      this.updateMaxAmount()
    }
    this.updateCallback = () => {
      this.updateMaxAmount()
    }
    this.windowClickListener = (ev: any) => {
      this.ngZone.run(() => {
        if (!ev.target.matches('.pad-btn') && !ev.target.parentNode.matches('.pad-btn')) {
          this.setBlur()
        }
      })
    }
  }

  setFixedAmount(a: string) {
    if (typeof a === 'undefined') {
      this.fixedAmount = undefined
      this.fromUnit = undefined
    } else {
      this.setBlur()
      this.fixedAmount = a
      this.fromUnit = 'SATS'
    }
    this.fromAmount = this.fixedAmount
    this.updateInputField()
    this.satoshisChange.emit(this.getSatoshis())
  }

  getAmountElValue(): string {
    return this.amountEl.value.replace(/,/g, '')
  }

  setAmountElValue(value: string) {
    if (value === '' || value === '--') {
      this.amountEl.value = value
      return
    }
    value = value.replace(/^0+/g, '')
    if (value === '') {
      this.amountEl.value = '0'
      return
    }
    if (value.match(/^\d+(\.\d*)?$/g)) {
      let a: string[] = value.split(/(?=\.)/g)
      this.amountEl.value = a[0].split('').reverse().join('').match(/.{1,3}/g).join(',').split('').reverse().join('') + (a[1] || '')
    } else if (value.match(/^\.\d*$/g)) {
      this.amountEl.value = '0' + value
    }
  }

  ngAfterViewInit() {
    this.wallet.subscribePreferredUnit(this.preferredUnitCallback)
    this.wallet.subscribePrice(this.priceCallback)
    this.wallet.subscribeUpdate(this.updateCallback)
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
    this.wallet.unsubscribeUpdate(this.updateCallback)
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
      newValue = this.wallet.convertUnit(this.fromUnit, unit, this.fromAmount) || '--'
    }
    this.setAmountElValue(newValue)
  }

  updateMaxAmount() {
    this.maxAmount = this.wallet.convertUnit('SATS', this.wallet.getPreferredUnit(), this.wallet.getCacheBalance().toString(), true) || '--'
  }

  enterMaxAmount() {
    this.fromUnit = 'SATS'
    this.setFromAmount(this.wallet.getCacheBalance())
    this.updateInputField()
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
    if (this.fixedAmount) {
      return
    }
    window.addEventListener('click', this.windowClickListener, true)
    this.isTyping = true
    this.unregisterBackButtonAction = this.platform.registerBackButtonAction(() => {
      this.setBlur()
    })
    this.padBtns = Array.from(this.padElRef.nativeElement.querySelectorAll('.pad-btn'))
    this.clear()
  }

  setBlur() {
    window.removeEventListener('click', this.windowClickListener, true)
    this.isTyping = false
    if (this.unregisterBackButtonAction) {
      this.unregisterBackButtonAction()
    }
  }

  clear() {
    this.setAmountElValue('')
    this.setFromAmount(undefined)
  }

  updatePadBtnState(ev: any) {
    this.padBtns.forEach((el: any) => {
      el.classList.remove('pad-btn-active')
    })
    Array.from(ev.touches).forEach((touch: any) => {
      let el: any = window.document.elementFromPoint(touch.clientX, touch.clientY)
      if (!el) {
        return
      }
      if (el.matches('.pad-btn')) {
        el.classList.add('pad-btn-active')
      } else if (el.parentNode.matches('.pad-btn')) {
        el.parentNode.classList.add('pad-btn-active')
      }
    })
  }

  onPadTouchStart(ev: any) {
    ev.preventDefault()
    this.updatePadBtnState(ev)
  }

  onPadTouchMove(ev: any) {
    ev.preventDefault()
    this.updatePadBtnState(ev)
  }

  onPadTouchCancel(ev: any) {
    ev.preventDefault()
    this.updatePadBtnState(ev)
  }

  onPadTouchEnd(ev: any) {
    ev.preventDefault()
    this.updatePadBtnState(ev)
    let type: string = 'click'
    let touch: any = ev.changedTouches[0]
    let clickEv: any = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window
    })
    let el: any = window.document.elementFromPoint(touch.clientX, touch.clientY)
    if (!el) {
      return
    }
    if (el.matches('.pad-btn')) {
      el.dispatchEvent(clickEv)
    } else if (el.parentNode.matches('.pad-btn')) {
      el.parentNode.dispatchEvent(clickEv)
    }
  }

  onPadClick(ev: any) {
    let btn: string = ev.target.dataset.btn
    if (btn === 'crypto') {
      this.fromUnit = this.wallet.getPreferredCryptoUnit()
      if (this.fromUnit !== this.wallet.getPreferredUnit()) {
        this.changeUnit()
      }
    } else if (btn === 'fiat') {
      this.fromUnit = this.wallet.getPreferredCurrency()
      if (this.fromUnit !== this.wallet.getPreferredUnit()) {
        this.changeUnit()
      }
    } else if (btn === 'empty') {

    } else if (btn === 'hide') {
      this.setBlur()
    } else if (btn === 'del') {
      let v: string = this.getAmountElValue()
      this.setAmountElValue(v.slice(0, Math.max(0, v.length - 1)))
    } else {
      this.setAmountElValue(this.getAmountElValue() + btn)
    }
    this.fromUnit = this.wallet.getPreferredUnit()
    let value: string = this.getAmountElValue()
    if (!value.match(/^\d+(\.\d*)?$/g) && !value.match(/^\.\d+$/g)) {
      this.setFromAmount(undefined)
    } else if (this.showMaxAmount && parseFloat(this.maxAmount.replace(/,/g, '')) === parseFloat(value)) {
      this.fromUnit = 'SATS'
      this.setFromAmount(this.wallet.getCacheBalance())
    } else {
      this.setFromAmount(parseFloat(value))
    }
  }

}
