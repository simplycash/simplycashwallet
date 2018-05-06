import { NgModule } from '@angular/core'
import { IonicPageModule } from 'ionic-angular'
import { SweepPage } from './sweep'
import { ComponentsModule } from '../../components/components.module'
import { PipesModule } from '../../pipes/pipes.module'

@NgModule({
  declarations: [
    SweepPage,
  ],
  imports: [
    IonicPageModule.forChild(SweepPage),
    ComponentsModule,
    PipesModule
  ],
})
export class SweepPageModule {}
