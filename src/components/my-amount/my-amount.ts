import { Component, ElementRef, ViewChild, Input, Output, EventEmitter } from '@angular/core'
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

  constructor(public platform: Platform, public wallet: Wallet) {
    this.preferredUnitCallback = (sym: string) => {
      this.updateInputField()
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
  }

  setFixedAmount(a: string) {
    if (typeof a === 'undefined') {
      this.fixedAmount = undefined
      this.fromUnit = undefined
    } else {
      this.fixedAmount = a
      this.fromUnit = 'SATS'
      if (this.unregisterBackButtonAction) {  // TODO:
        this.unregisterBackButtonAction()
      }
    }
    this.fromAmount = this.fixedAmount
    this.updateInputField()
    this.satoshisChange.emit(this.getSatoshis())
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
    this.amountEl.value = newValue
  }

  updateMaxAmount() {
    this.maxAmount = this.wallet.convertUnit('SATS', this.wallet.getPreferredUnit(), this.wallet.getCacheBalance().toString()) || '--'
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
    this.amountEl.setFocus()
  }

  onAmountFocus() {
    if (this.fixedAmount) {
      return
    }
    this.isTyping = true
    this.unregisterBackButtonAction = this.platform.registerBackButtonAction(() => {
      this.amountEl.setBlur()
    })
    this.padBtns = this.padBtns || Array.from(this.padElRef.nativeElement.querySelectorAll('.pad-btn'))
    this.clear()
  }

  onAmountBlur() {
    this.isTyping = false
    if (this.unregisterBackButtonAction) {
      this.unregisterBackButtonAction()
    }
  }

  clear() {
    this.amountEl.value = ''
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
    if (btn === 'del') {
      this.amountEl.value = this.amountEl.value.slice(0, this.amountEl.value.length - 1)
    } else {
      this.amountEl.value += btn
    }
    this.fromUnit = this.wallet.getPreferredUnit()
    if (!this.amountEl.value.match(/^\d+(\.\d*)?$/g) && !this.amountEl.value.match(/^\.\d+$/g)) {
      this.setFromAmount(undefined)
      return
    }
    if (this.showMaxAmount && parseFloat(this.maxAmount) === parseFloat(this.amountEl.value)) {
      this.fromUnit = 'SATS'
      this.setFromAmount(this.wallet.getCacheBalance())
    } else {
      this.setFromAmount(parseFloat(this.amountEl.value))
    }
  }

}
